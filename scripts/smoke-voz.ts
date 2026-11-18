/** Smoke test with real providers: TTS (PCM 16 kHz) → STT streaming → transcript. ~70 TTS characters. */
import { getTtsEngine } from "@/server/voice/tts";
import { abrirStt } from "@/server/voice/stt";

const frase = "Olá, eu queria marcar uma consulta para quinta-feira de manhã.";
const t0 = Date.now();
const chunks: Uint8Array[] = [];
let primeiroByte = 0;
for await (const c of getTtsEngine().stream({ voiceId: "rafael", text: frase, formato: "pcm_16000" })) {
  if (!primeiroByte) primeiroByte = Date.now() - t0;
  chunks.push(c);
}
const pcm = Buffer.concat(chunks);
console.log(`TTS: ${pcm.length} bytes (${(pcm.length / 32000).toFixed(1)} s de áudio), primeiro byte em ${primeiroByte} ms`);

const transcrito = await new Promise<string>((resolve, reject) => {
  let ultimo = "";
  const stt = abrirStt(
    {
      aoComecarFala: () => {},
      aoTranscrever: (t, final, fim) => {
        if (final) ultimo = t;
        if (fim) resolve(t);
      },
      aoErro: reject,
    },
    { sampleRate: 16000, encoding: "linear16" },
  );
  // stream in real-time-ish 100 ms frames, then 1.5 s of silence for endpointing
  let i = 0;
  const timer = setInterval(() => {
    if (i < pcm.length) {
      stt.enviar(pcm.subarray(i, i + 3200));
      i += 3200;
    } else if (i < pcm.length + 48000) {
      stt.enviar(Buffer.alloc(3200));
      i += 3200;
    } else {
      clearInterval(timer);
      stt.fechar();
      setTimeout(() => resolve(ultimo), 2500);
    }
  }, 100);
});
console.log(`STT: "${transcrito}"`);
process.exit(transcrito.toLowerCase().includes("consulta") ? 0 : 1);
