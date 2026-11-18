/**
 * Voice gateway: one pipeline for every transport.
 *   transport (browser PCM16 16 kHz | Twilio μ-law 8 kHz) → STT (Deepgram) → agent runtime → TTS → transport
 * Run with: npm run voice   (separate process; shares Postgres with the web app)
 */
import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { verificarTokenVoz } from "@/server/voice/token";
import { abrirStt, type StreamStt } from "@/server/voice/stt";
import { getTtsEngine, ttsConfigurado, type FormatoAudio } from "@/server/voice/tts";
import { encerrarConversa, ErroLinhaOcupada, iniciarConversa, registrarUsoVoz, responder } from "@/server/agent/runtime";
import { configParaConversa } from "@/server/agent/agentes";
import { aceitarTwilio } from "./twilio";
import { esperaExtraMs, juntar } from "@/lib/voz/turno";
import { Gravador } from "@/server/audio/gravador";
import { salvarAudio } from "@/server/audio/armazenamento";

const PORTA = Number(process.env.VOICE_PORT ?? 3100);

export interface Transporte {
  formatoTts: FormatoAudio;
  stt: { sampleRate: number; encoding: "linear16" | "mulaw" };
  enviarAudio(chunk: Uint8Array): void;
  enviarEvento(e: Record<string, unknown>): void;
  limparAudio(): void;
  fechar(): void;
}

export interface Sessao {
  orgId: string;
  agenteId: string;
  canal: "teste_voz" | "simulador" | "telefone" | "widget";
  de?: string;
}

/** Runs a full voice conversation over a transport. Returns a handler for inbound audio + a close hook. */
export async function rodarPipeline(sessao: Sessao, t: Transporte) {
  const inicio = Date.now();
  let conversaId: string;
  let saudacao = "";
  let versaoId: string | null = null;
  let iniciada: Record<string, unknown> = {};
  try {
    const ini = await iniciarConversa({
      orgId: sessao.orgId,
      agenteId: sessao.agenteId,
      canal: sessao.canal,
      de: sessao.de,
      alvo: sessao.canal === "teste_voz" ? "rascunho" : "publicado",
    });
    conversaId = ini.conversaId;
    iniciada = { conversa_id: conversaId, modo_demo: ini.modoDemo, modo_recado: ini.modoRecado };
    saudacao = ini.saudacao;
    versaoId = ini.versaoId;
  } catch (e) {
    t.enviarEvento({ tipo: "erro", mensagem: e instanceof ErroLinhaOcupada ? "Todas as linhas estão ocupadas" : e instanceof Error ? e.message : "Erro" });
    t.fechar();
    return { aoAudio: (_: Buffer) => {}, aoTextoDigitado: (_: string) => {}, aoFechar: async () => {} };
  }

  const [org] = await getDb().select().from(schema.organizacoes).where(eq(schema.organizacoes.id, sessao.orgId));
  const gravador = org.retencaoAudioDias > 0 && t.formatoTts !== "mp3" ? new Gravador(t.formatoTts) : null;
  const { config } = await configParaConversa(sessao.orgId, sessao.agenteId, versaoId ? { versaoId } : "rascunho");
  t.enviarEvento({ tipo: "sessao.iniciada", ...iniciada, tts: ttsConfigurado(config.voz.vozId) });
  let falando: AbortController | null = null;
  let ocupado = false;
  let encerrada = false;
  let fimFalaEm = 0;
  const latencias: number[] = [];
  const fila: string[] = [];

  async function falar(texto: string) {
    t.enviarEvento({ tipo: "agente.texto", texto });
    if (!ttsConfigurado(config.voz.vozId)) return t.enviarEvento({ tipo: "agente.sem_audio", texto });
    const ctrl = new AbortController();
    falando = ctrl;
    let primeiro = true;
    try {
      for await (const chunk of getTtsEngine(config.voz.vozId).stream({
        voiceId: config.voz.vozId,
        text: texto,
        tier: config.voz.ultra ? "ultra" : "padrao",
        formato: t.formatoTts,
        velocidade: config.voz.velocidade,
        signal: ctrl.signal,
      })) {
        if (ctrl.signal.aborted) break;
        if (primeiro && fimFalaEm) {
          const ms = Date.now() - fimFalaEm;
          latencias.push(ms);
          t.enviarEvento({ tipo: "metrica", latencia_ms: ms });
          primeiro = false;
        }
        t.enviarAudio(chunk);
        gravador?.saida(chunk);
      }
      t.enviarEvento({ tipo: "agente.audio_fim" });
    } catch (e) {
      if (!ctrl.signal.aborted) t.enviarEvento({ tipo: "erro", mensagem: `Voz: ${e instanceof Error ? e.message : e}` });
    } finally {
      if (falando === ctrl) falando = null;
    }
  }

  async function finalizar() {
    if (encerrada) return;
    encerrada = true;
    stt?.fechar();
    falando?.abort();
    await registrarUsoVoz(conversaId, {
      sttSegundos: stt?.segundos() ?? 0,
      telefoniaSegundos: sessao.canal === "telefone" ? (Date.now() - inicio) / 1000 : 0,
    });
    const c = await encerrarConversa(conversaId, { duracaoS: (Date.now() - inicio) / 1000 });
    if (gravador && gravador.duracaoS > 0.5) {
      try {
        const { wav, picos } = gravador.finalizar();
        const chave = `${sessao.orgId}/${conversaId}.wav`;
        await salvarAudio(chave, wav);
        await getDb().update(schema.conversas).set({ audioChave: chave, audioPicos: picos }).where(eq(schema.conversas.id, conversaId));
      } catch (e) {
        console.error("gravação:", e instanceof Error ? e.message : e);
      }
    }
    const media = latencias.length ? Math.round(latencias.reduce((a, b) => a + b, 0) / latencias.length) : null;
    t.enviarEvento({
      tipo: "sessao.encerrada",
      resultado: c.resultado,
      resumo: c.resumo,
      dados: c.dados,
      avaliacao: c.avaliacao,
      duracao_s: c.duracaoS,
      minutos_cobrados: c.minutosCobrados,
      latencia_media_ms: media,
    });
    t.fechar();
  }

  async function processarFila() {
    if (ocupado) return;
    ocupado = true;
    try {
      while (fila.length && !encerrada) {
        const fala = fila.splice(0).join(" ");
        const r = await responder(conversaId, fala, { offsetMs: Date.now() - inicio });
        for (const a of r.acoes) t.enviarEvento({ tipo: "acao", nome: a.nome, resultado: a.resultado });
        for (const f of r.falas) await falar(f);
        if (r.encerrar) {
          if (r.transferirPara) t.enviarEvento({ tipo: "transferencia", para: r.transferirPara });
          await finalizar();
        }
      }
    } catch (e) {
      t.enviarEvento({ tipo: "erro", mensagem: e instanceof Error ? e.message : "Erro" });
    } finally {
      ocupado = false;
    }
  }

  // Turn-taking: final utterances wait briefly when the sentence looks unfinished (src/lib/voz/turno.ts).
  let parciais: string[] = [];
  let esperando: ReturnType<typeof setTimeout> | null = null;
  function liberarTurno() {
    if (esperando) clearTimeout(esperando);
    esperando = null;
    const texto = juntar(parciais);
    parciais = [];
    if (!texto) return;
    fila.push(texto);
    void processarFila();
  }

  let stt: StreamStt | null = null;
  try {
    stt = abrirStt(
      {
        aoComecarFala: () => {
          // The caller resumed before we answered: keep listening and merge with what they said.
          if (esperando) {
            clearTimeout(esperando);
            esperando = setTimeout(liberarTurno, 4000); // safety: the new sound may be noise
          }
          if (falando) {
            falando.abort(); // barge-in: the customer talked over the agent
            t.limparAudio();
            gravador?.interromper();
            t.enviarEvento({ tipo: "interrupcao" });
          }
        },
        aoTranscrever: (texto, final, fimDeFala) => {
          t.enviarEvento({ tipo: final ? "transcricao.final" : "transcricao.parcial", texto });
          if (fimDeFala) {
            fimFalaEm = Date.now();
            parciais.push(texto);
            if (esperando) clearTimeout(esperando);
            const extra = esperaExtraMs(juntar(parciais));
            if (extra === 0) liberarTurno();
            else esperando = setTimeout(liberarTurno, extra);
          }
        },
        aoErro: (e) => t.enviarEvento({ tipo: "erro", mensagem: `Transcrição: ${e.message}` }),
      },
      t.stt,
    );
  } catch (e) {
    t.enviarEvento({ tipo: "erro", mensagem: e instanceof Error ? e.message : "STT indisponível" });
  }

  // Safety limits from the agent config.
  const limite = setTimeout(() => void finalizar(), config.seguranca.duracaoMaxMin * 60_000);
  void falar(saudacao);

  return {
    aoAudio: (pcm: Buffer) => {
      gravador?.entrada(pcm);
      stt?.enviar(pcm);
    },
    aoTextoDigitado: (texto: string) => {
      fimFalaEm = Date.now();
      fila.push(texto);
      void processarFila();
    },
    aoFechar: async () => {
      clearTimeout(limite);
      await finalizar();
    },
  };
}

/* ───────── Browser transport ───────── */

async function aceitarNavegador(ws: WebSocket, req: IncomingMessage) {
  const url = new URL(req.url ?? "/", "http://x");
  const token = verificarTokenVoz(url.searchParams.get("token") ?? "");
  if (!token) return ws.close(4401, "token inválido");
  const t: Transporte = {
    formatoTts: "pcm_16000",
    stt: { sampleRate: 16000, encoding: "linear16" },
    enviarAudio: (c) => ws.readyState === ws.OPEN && ws.send(c),
    enviarEvento: (e) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(e)),
    limparAudio: () => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ tipo: "audio.limpar" })),
    fechar: () => setTimeout(() => ws.close(1000), 300),
  };
  const p = await rodarPipeline({ orgId: token.orgId, agenteId: token.agenteId, canal: token.canal }, t);
  ws.on("message", (data, isBinary) => {
    if (isBinary) return p.aoAudio(data as Buffer);
    try {
      const m = JSON.parse(String(data));
      if (m.tipo === "encerrar") void p.aoFechar();
      if (m.tipo === "texto" && typeof m.texto === "string") p.aoTextoDigitado(m.texto);
    } catch {
      /* ignore */
    }
  });
  ws.on("close", () => void p.aoFechar());
}

const http = createServer(async (req, res) => {
  if (req.url === "/saude") {
    const db = getDb();
    await db.select({ id: schema.organizacoes.id }).from(schema.organizacoes).where(eq(schema.organizacoes.id, "-")).limit(1);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, tts: ttsConfigurado(), stt: Boolean(process.env.DEEPGRAM_API_KEY) }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });
http.on("upgrade", (req, socket, head) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path !== "/conversa" && path !== "/twilio") return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (path === "/twilio") void aceitarTwilio(ws, req);
    else void aceitarNavegador(ws, req);
  });
});

if (process.env.VOICE_NO_LISTEN !== "1")
  http.listen(PORTA, () => console.log(`Gateway de voz em ws://localhost:${PORTA} (tts=${ttsConfigurado()}, stt=${process.env.DEEPGRAM_API_KEY ? (process.env.STT_MODO === "rest" ? "rest" : "streaming") : "off"})`));
