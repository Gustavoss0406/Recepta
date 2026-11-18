/**
 * Twilio Media Streams transport (μ-law 8 kHz, base64 JSON frames).
 * Ready for production; not exercised end-to-end until a Twilio account is configured.
 * TwiML is served by /api/twilio/voz, which signs a token carried as a <Parameter>.
 */
import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import { verificarTokenVoz } from "@/server/voice/token";
import { rodarPipeline, type Transporte } from "./server";

interface MsgTwilio {
  event: "connected" | "start" | "media" | "stop" | "mark";
  start?: { streamSid: string; callSid: string; customParameters?: Record<string, string> };
  media?: { payload: string };
}

export async function aceitarTwilio(ws: WebSocket, _req: IncomingMessage) {
  let streamSid = "";
  let pipeline: Awaited<ReturnType<typeof rodarPipeline>> | null = null;

  const t: Transporte = {
    formatoTts: "ulaw_8000",
    stt: { sampleRate: 8000, encoding: "mulaw" },
    enviarAudio: (c) =>
      ws.readyState === ws.OPEN && ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: Buffer.from(c).toString("base64") } })),
    enviarEvento: () => {}, // phone callers only hear audio
    limparAudio: () => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ event: "clear", streamSid })),
    fechar: () => setTimeout(() => ws.close(1000), 500),
  };

  ws.on("message", async (data) => {
    let m: MsgTwilio;
    try {
      m = JSON.parse(String(data));
    } catch {
      return;
    }
    if (m.event === "start" && m.start) {
      streamSid = m.start.streamSid;
      const token = verificarTokenVoz(m.start.customParameters?.token ?? "");
      if (!token || token.canal !== "telefone") return ws.close(4401, "token inválido");
      pipeline = await rodarPipeline({ orgId: token.orgId, agenteId: token.agenteId, canal: "telefone", de: token.de }, t);
    } else if (m.event === "media" && m.media && pipeline) {
      pipeline.aoAudio(Buffer.from(m.media.payload, "base64"));
    } else if (m.event === "stop") {
      await pipeline?.aoFechar();
    }
  });
  ws.on("close", () => void pipeline?.aoFechar());
}
