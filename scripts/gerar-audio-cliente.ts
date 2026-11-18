/** Generates the E2E "customer voice" fixture (PCM 16 kHz WAV) with the TTS engine. ~45 characters. */
import { writeFileSync } from "node:fs";
import { getTtsEngine } from "@/server/voice/tts";

const chunks: Uint8Array[] = [];
for await (const c of getTtsEngine().stream({ voiceId: "rafael", text: "Oi, eu queria marcar uma consulta.", formato: "pcm_16000" })) chunks.push(c);
const silencio = Buffer.alloc(16000 * 2 * 3); // 3 s of silence after the phrase (Chrome loops the file)
const pcm = Buffer.concat([Buffer.alloc(16000), ...chunks, silencio]);
const h = Buffer.alloc(44);
h.write("RIFF", 0);
h.writeUInt32LE(36 + pcm.length, 4);
h.write("WAVEfmt ", 8);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(1, 22);
h.writeUInt32LE(16000, 24);
h.writeUInt32LE(32000, 28);
h.writeUInt16LE(2, 32);
h.writeUInt16LE(16, 34);
h.write("data", 36);
h.writeUInt32LE(pcm.length, 40);
writeFileSync("e2e/fixtures/cliente.wav", Buffer.concat([h, pcm]));
console.log("e2e/fixtures/cliente.wav", pcm.length, "bytes");
