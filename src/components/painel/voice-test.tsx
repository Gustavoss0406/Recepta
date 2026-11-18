"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, PhoneOff } from "lucide-react";
import { tokenVoz } from "@/app/painel/voz-actions";
import { Orb } from "@/components/ui/orb";
import { ResumoLigacao, type ResumoFinal } from "./test-panel";

type Linha = { papel: "agente" | "cliente" | "acao" | "sistema"; texto: string };

const WORKLET = `
class Captura extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; }
  process(inputs) {
    const ch = inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        this.buf.push(s < 0 ? s * 0x8000 : s * 0x7fff);
      }
      if (this.buf.length >= 1600) { // 100 ms at 16 kHz
        this.port.postMessage(new Int16Array(this.buf).buffer, []);
        this.buf = [];
      }
    }
    return true;
  }
}
registerProcessor("captura", Captura);
`;

/**
 * Browser voice test: mic → gateway (Deepgram STT → agent → TTS) → speaker.
 * canal "teste_voz" runs the draft; "simulador" simulates an inbound phone call on the published version.
 */
export function VoiceTest({
  agenteId,
  canal = "teste_voz",
  obterToken,
  variante = "painel",
  nomeAgente,
}: {
  agenteId: string;
  canal?: "teste_voz" | "simulador";
  /** Token source override (the public website widget uses its own rate-limited endpoint). */
  obterToken?: () => Promise<{ token: string; url: string }>;
  /** "widget": the end customer's view on a website (no internal details, analysis or tool names). */
  variante?: "painel" | "widget";
  nomeAgente?: string;
}) {
  const publico = variante === "widget";
  const [estado, setEstado] = useState<"parado" | "conectando" | "ativo" | "fim">("parado");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [parcial, setParcial] = useState("");
  const [falando, setFalando] = useState(false);
  const [latencia, setLatencia] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fim, setFim] = useState<ResumoFinal | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const proximo = useRef(0);
  const fontes = useRef<AudioBufferSourceNode[]>([]);
  const sobra = useRef<Uint8Array | null>(null);

  useEffect(() => () => parar(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function tocarPcm(dados: ArrayBuffer) {
    const c = ctx.current;
    if (!c) return;
    let bytes = new Uint8Array(dados);
    if (sobra.current) {
      const junto = new Uint8Array(sobra.current.length + bytes.length);
      junto.set(sobra.current);
      junto.set(bytes, sobra.current.length);
      bytes = junto;
      sobra.current = null;
    }
    if (bytes.length % 2) {
      sobra.current = bytes.slice(-1);
      bytes = bytes.slice(0, -1);
    }
    const amostras = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    const buf = c.createBuffer(1, amostras.length, 16000);
    const canalAudio = buf.getChannelData(0);
    for (let i = 0; i < amostras.length; i++) canalAudio[i] = amostras[i] / 0x8000;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    const quando = Math.max(c.currentTime + 0.02, proximo.current);
    src.start(quando);
    proximo.current = quando + buf.duration;
    fontes.current.push(src);
    setFalando(true);
    src.onended = () => {
      fontes.current = fontes.current.filter((f) => f !== src);
      if (!fontes.current.length) setFalando(false);
    };
  }

  function limparAudio() {
    fontes.current.forEach((f) => {
      try {
        f.stop();
      } catch {}
    });
    fontes.current = [];
    proximo.current = 0;
    setFalando(false);
    speechSynthesis?.cancel();
  }

  function falarNavegador(texto: string) {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "pt-BR";
    speechSynthesis.speak(u);
  }

  async function iniciar() {
    setEstado("conectando");
    setLinhas([]);
    setFim(null);
    setAviso(null);
    try {
      const { token, url } = await (obterToken ? obterToken() : tokenVoz(agenteId, canal));
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      stream.current = media;
      const c = new AudioContext({ sampleRate: 16000 });
      ctx.current = c;
      const blob = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await c.audioWorklet.addModule(blob);
      const node = new AudioWorkletNode(c, "captura");
      c.createMediaStreamSource(media).connect(node);

      const sock = new WebSocket(`${url}/conversa?token=${encodeURIComponent(token)}`);
      sock.binaryType = "arraybuffer";
      ws.current = sock;
      node.port.onmessage = (e) => sock.readyState === WebSocket.OPEN && sock.send(e.data);
      sock.onmessage = (e) => {
        if (typeof e.data !== "string") return tocarPcm(e.data);
        const m = JSON.parse(e.data);
        switch (m.tipo) {
          case "sessao.iniciada":
            setEstado("ativo");
            if (m.modo_demo && !publico) setAviso("Modo demonstração: sem ANTHROPIC_API_KEY as respostas são roteirizadas.");
            if (!m.tts && !publico) setAviso((a) => `${a ? a + " " : ""}Voz premium não configurada: usando a voz do navegador (provisória).`);
            break;
          case "transcricao.parcial":
            setParcial(m.texto);
            break;
          case "transcricao.final":
            setParcial("");
            setLinhas((l) => [...l, { papel: "cliente", texto: m.texto }]);
            break;
          case "agente.texto":
            setLinhas((l) => [...l, { papel: "agente", texto: m.texto }]);
            break;
          case "agente.sem_audio":
            falarNavegador(m.texto);
            break;
          case "acao":
            if (!publico) setLinhas((l) => [...l, { papel: "acao", texto: m.nome.replaceAll("_", " ") }]);
            break;
          case "interrupcao":
          case "audio.limpar":
            limparAudio();
            break;
          case "metrica":
            if (publico) break;
            setLatencia(m.latencia_ms);
            break;
          case "erro":
            setLinhas((l) => [...l, { papel: "sistema", texto: publico ? "Não foi possível continuar o atendimento. Tente de novo." : m.mensagem }]);
            break;
          case "sessao.encerrada":
            if (!publico) setFim({ resultado: m.resultado, resumo: m.resumo, dados: m.dados, avaliacao: m.avaliacao, duracaoS: m.duracao_s });
            setEstado("fim");
            break;
        }
      };
      sock.onclose = (e) => {
        if (e.code === 4401) setLinhas((l) => [...l, { papel: "sistema", texto: "Sessão expirada. Tente de novo." }]);
        pararMidia();
        setEstado((s) => (s === "ativo" || s === "conectando" ? "fim" : s));
      };
      sock.onerror = () =>
        setLinhas((l) => [...l, { papel: "sistema", texto: publico ? "Não foi possível conectar. Tente de novo em instantes." : "Não foi possível conectar ao gateway de voz (npm run voice)." }]);
    } catch (e) {
      setLinhas([{ papel: "sistema", texto: e instanceof Error ? e.message : "Microfone indisponível" }]);
      setEstado("parado");
      pararMidia();
    }
  }

  function pararMidia() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close();
    ctx.current = null;
  }

  function parar() {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ tipo: "encerrar" }));
    limparAudio();
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {aviso && <p className="mx-4 mt-3 rounded-[10px] bg-[#fff6e5] px-3 py-2 text-xs text-[#8a5a00]">{aviso}</p>}
      <div className="flex flex-col items-center gap-4 px-4 pt-8 pb-4">
        <Orb tom={canal === "simulador" ? "sky" : "padrao"} tamanho={128} estado={estado === "ativo" ? (falando ? "talking" : "listening") : estado === "conectando" ? "thinking" : null} />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {estado === "parado" && (publico ? `Toque para falar com ${nomeAgente ?? "a gente"}` : canal === "simulador" ? "Simule uma ligação recebida" : "Fale com o rascunho do agente")}
          {estado === "conectando" && "Conectando…"}
          {estado === "ativo" && (falando ? (publico ? "Falando… pode interromper" : "Agente falando… (pode interromper)") : parcial || "Ouvindo…")}
          {estado === "fim" && (publico ? "Conversa encerrada. Obrigado!" : "Ligação encerrada")}
        </p>
        {latencia != null && <p className="font-mono text-xs text-muted-foreground">resposta em {latencia} ms</p>}
        {estado === "ativo" || estado === "conectando" ? (
          <button type="button" onClick={parar} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#e5484d] px-4 text-sm font-medium text-white hover:bg-[#d93d42]">
            <PhoneOff size={14} /> {publico ? "Encerrar" : "Desligar"}
          </button>
        ) : (
          <button type="button" onClick={iniciar} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-white hover:bg-foreground/85">
            <Mic size={14} /> {publico ? (estado === "fim" ? "Falar de novo" : "Começar conversa") : estado === "fim" ? "Ligar de novo" : canal === "simulador" ? "Simular ligação" : "Falar com o agente"}
          </button>
        )}
      </div>
      <ol className="flex-1 space-y-2 overflow-y-auto px-4 pb-4 text-sm">
        {linhas.map((l, i) => (
          <li
            key={i}
            className={
              l.papel === "cliente"
                ? "text-right text-ink"
                : l.papel === "agente"
                  ? "text-body"
                  : l.papel === "acao"
                    ? "text-center text-xs text-muted-foreground"
                    : "text-center text-xs text-error"
            }
          >
            {l.papel === "acao" ? `⚙ ${l.texto}` : l.texto}
          </li>
        ))}
        {fim && <ResumoLigacao fim={fim} />}
      </ol>
    </div>
  );
}
