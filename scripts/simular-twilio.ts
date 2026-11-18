/** Simulates a Twilio inbound call end to end: signed webhook → TwiML → Media Stream WS with μ-law audio. */
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import WebSocket from "ws";
import { converter } from "@/server/audio/conversao";

const base = process.env.RECEPTA_URL_PUBLICA ?? "http://127.0.0.1:3000";
const para = process.argv[2] ?? "+18575977854";
const saida = process.argv[3] ?? "ligacao.wav";
const params: Record<string, string> = { CallSid: "CAsimulado", From: "+5547997780000", To: para, Direction: "inbound" };
const url = `${base}/api/twilio/voz`;
const assinatura = createHmac("sha1", process.env.TWILIO_AUTH_TOKEN!)
  .update(url + Object.keys(params).sort().map((k) => k + params[k]).join(""))
  .digest("base64");
const r = await fetch(url, { method: "POST", headers: { "x-twilio-signature": assinatura }, body: new URLSearchParams(params) });
const xml = await r.text();
console.log("webhook", r.status, xml.slice(0, 120));
const wss = /Stream url="([^"]+)"/.exec(xml)![1];
const token = /value="([^"]+)"/.exec(xml)![1];

const ulaw = Buffer.from(converter(readFileSync("e2e/fixtures/cliente.wav"), "ulaw_8000"));
const recebido: Buffer[] = [];
const ws = new WebSocket(wss);
await new Promise((ok) => ws.on("open", ok));
ws.send(JSON.stringify({ event: "connected" }));
ws.send(JSON.stringify({ event: "start", start: { streamSid: "MZsim", callSid: "CAsimulado", customParameters: { token } } }));
ws.on("message", (d) => {
  const m = JSON.parse(String(d));
  if (m.event === "media") recebido.push(Buffer.from(m.media.payload, "base64"));
});
const frame = (b: Buffer) => ws.send(JSON.stringify({ event: "media", streamSid: "MZsim", media: { payload: b.toString("base64") } }));
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const silencio = (s: number) => Buffer.alloc(8000 * s, 0xff);
async function tocar(b: Buffer) { for (let i = 0; i < b.length; i += 160) { frame(b.subarray(i, i + 160)); await esperar(20); } }
await tocar(silencio(9)); // greeting plays in real time
const recebidoSaudacao = recebido.reduce((n, b) => n + b.length, 0);
await tocar(ulaw);
await tocar(silencio(10));
ws.send(JSON.stringify({ event: "stop" }));
ws.close();
const audio = Buffer.concat(recebido);
console.log(`áudio recebido: saudação ${(recebidoSaudacao / 8000).toFixed(1)} s, total ${(audio.length / 8000).toFixed(1)} s`);
// μ-law → WAV (format 7) so any player opens it
const h = Buffer.alloc(44); h.write("RIFF", 0); h.writeUInt32LE(36 + audio.length, 4); h.write("WAVEfmt ", 8);
h.writeUInt32LE(16, 16); h.writeUInt16LE(7, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(8000, 24); h.writeUInt32LE(8000, 28);
h.writeUInt16LE(1, 32); h.writeUInt16LE(8, 34); h.write("data", 36); h.writeUInt32LE(audio.length, 40);
writeFileSync(saida, Buffer.concat([h, audio]));
process.exit(audio.length > 8000 ? 0 : 1);
