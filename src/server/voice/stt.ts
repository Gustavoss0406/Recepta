import "server-only";
import { HttpsProxyAgent } from "https-proxy-agent";
import WebSocket from "ws";
import { mulawParaPcm16, Vad } from "./vad";

export interface EventosStt {
  /** Interim and final transcripts. `fimDeFala` = endpoint detected (customer finished the utterance). */
  aoTranscrever: (texto: string, final: boolean, fimDeFala: boolean) => void;
  aoComecarFala: () => void;
  aoErro: (e: Error) => void;
}

export interface StreamStt {
  enviar(pcm: Buffer): void;
  fechar(): void;
  /** Seconds of audio streamed to the provider (billing). */
  segundos(): number;
}

/**
 * Picks the STT strategy: live streaming over WebSocket (production default) or per-utterance REST
 * with local VAD (STT_MODO=rest), for networks that cannot carry outbound WebSockets.
 */
export function abrirStt(ev: EventosStt, opts: { sampleRate: number; encoding: "linear16" | "mulaw" }): StreamStt {
  return process.env.STT_MODO === "rest" ? abrirSttRest(ev, opts) : abrirSttDeepgram(ev, opts);
}

/** Deepgram pre-recorded API per utterance; endpointing done by our VAD. */
export function abrirSttRest(ev: EventosStt, opts: { sampleRate: number; encoding: "linear16" | "mulaw" }): StreamStt {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("STT não configurado (DEEPGRAM_API_KEY)");
  let segundos = 0;
  let fechado = false;
  const vad = new Vad(
    {
      aoComecar: () => ev.aoComecarFala(),
      aoTerminar: async (pcm) => {
        if (pcm.length < opts.sampleRate * 2 * 0.3) return; // ignore blips < 300 ms
        try {
          const params = new URLSearchParams({
            model: "nova-3",
            language: "pt-BR",
            encoding: "linear16",
            sample_rate: String(opts.sampleRate),
            channels: "1",
            smart_format: "true",
            punctuate: "true",
          });
          const r = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
            method: "POST",
            headers: { Authorization: `Token ${key}`, "content-type": "application/octet-stream" },
            body: new Uint8Array(pcm),
            signal: AbortSignal.timeout(10_000),
          });
          if (!r.ok) throw new Error(`Deepgram respondeu ${r.status}`);
          const j = (await r.json()) as { results?: { channels?: { alternatives?: { transcript: string }[] }[] } };
          const t = j.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
          if (t && !fechado) ev.aoTranscrever(t, true, true);
        } catch (e) {
          ev.aoErro(e instanceof Error ? e : new Error(String(e)));
        }
      },
    },
    { sampleRate: opts.sampleRate },
  );
  return {
    enviar(chunk) {
      const pcm = opts.encoding === "mulaw" ? mulawParaPcm16(chunk) : chunk;
      segundos += pcm.length / (opts.sampleRate * 2);
      vad.processar(pcm);
    },
    fechar() {
      fechado = true;
    },
    segundos: () => segundos,
  };
}

/** Deepgram live transcription (nova-3, pt-BR) over WebSocket. */
export function abrirSttDeepgram(ev: EventosStt, opts: { sampleRate: number; encoding: "linear16" | "mulaw" }): StreamStt {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("STT não configurado (DEEPGRAM_API_KEY)");
  const params = new URLSearchParams({
    model: "nova-3",
    language: "pt-BR",
    encoding: opts.encoding,
    sample_rate: String(opts.sampleRate),
    channels: "1",
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    endpointing: "350",
    utterance_end_ms: "1000",
    vad_events: "true",
  });
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
    headers: { Authorization: `Token ${key}` },
    ...(proxy ? { agent: new HttpsProxyAgent(proxy) } : {}),
  });
  let bytes = 0;
  const fila: Buffer[] = [];
  const bytesPorSeg = opts.sampleRate * (opts.encoding === "linear16" ? 2 : 1);
  let finalAcumulado = "";

  ws.on("open", () => {
    for (const b of fila.splice(0)) ws.send(b);
  });
  ws.on("message", (data) => {
    let m: { type?: string; is_final?: boolean; speech_final?: boolean; channel?: { alternatives?: { transcript: string }[] } };
    try {
      m = JSON.parse(String(data));
    } catch {
      return;
    }
    if (m.type === "SpeechStarted") return ev.aoComecarFala();
    if (m.type === "UtteranceEnd") {
      if (finalAcumulado.trim()) ev.aoTranscrever(finalAcumulado.trim(), true, true);
      finalAcumulado = "";
      return;
    }
    if (m.type !== "Results") return;
    const t = m.channel?.alternatives?.[0]?.transcript ?? "";
    if (m.is_final) {
      if (t) finalAcumulado += ` ${t}`;
      if (m.speech_final && finalAcumulado.trim()) {
        ev.aoTranscrever(finalAcumulado.trim(), true, true);
        finalAcumulado = "";
      } else if (t) ev.aoTranscrever(finalAcumulado.trim(), true, false);
    } else if (t) ev.aoTranscrever(`${finalAcumulado} ${t}`.trim(), false, false);
  });
  ws.on("error", (e) => ev.aoErro(e));
  ws.on("unexpected-response", (_req, res) => ev.aoErro(new Error(`Deepgram respondeu ${res.statusCode}`)));
  const keepAlive = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "KeepAlive" })), 8000);

  return {
    enviar(pcm) {
      bytes += pcm.length;
      if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
      else if (ws.readyState === WebSocket.CONNECTING) fila.push(pcm);
    },
    fechar() {
      clearInterval(keepAlive);
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "CloseStream" }));
      setTimeout(() => ws.close(), 500);
    },
    segundos: () => bytes / bytesPorSeg,
  };
}
