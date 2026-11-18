import "server-only";
import { converter } from "@/server/audio/conversao";
import type { FormatoAudio, TtsEngine, TtsRequest } from "./tts";
import { TtsNotConfiguredError } from "./tts";

/**
 * Self-hosted voice engines. Both return a WAV for the whole sentence (the agent already
 * speaks one sentence at a time); it is converted to the call's format and streamed in
 * 40 ms frames. Voices are created by voice design (text description), never cloned.
 */

/** Per-voice engine parameters (server-side only). Override any of them with *_VOICE_MAP. */
const DESIGN: Record<string, { instruct: string }> = {
  clara: { instruct: "Voz feminina adulta, brasileira, calorosa e profissional, fala tranquila e clara, recepcionista de clínica" },
  davi: { instruct: "Voz masculina adulta, brasileira, grave e segura, tom cordial e objetivo, atendimento de escritório" },
  marina: { instruct: "Brazilian Portuguese female voice, São Paulo accent, warm, expressive, friendly receptionist" },
  otavio: { instruct: "Brazilian Portuguese male voice, Rio de Janeiro accent, cordial and relaxed, restaurant host" },
};

function mapa(env: string): Record<string, Record<string, string>> {
  try {
    return JSON.parse(process.env[env] ?? "{}");
  } catch {
    return {};
  }
}

const FRAME: Record<Exclude<FormatoAudio, "mp3">, number> = { pcm_16000: 1280, ulaw_8000: 320 }; // 40 ms

async function* emQuadros(audio: Uint8Array, formato: FormatoAudio) {
  const n = formato === "mp3" ? audio.length : FRAME[formato];
  for (let i = 0; i < audio.length; i += n) yield audio.subarray(i, i + n);
}

abstract class MotorProprio implements TtsEngine {
  abstract readonly name: string;
  protected abstract gerarWav(req: TtsRequest): Promise<Uint8Array>;

  async synthesize(req: TtsRequest) {
    const wav = await this.gerarWav(req);
    const f = req.formato ?? "mp3";
    if (f === "mp3") return { audio: wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer, contentType: "audio/wav", chars: req.text.length };
    const a = converter(wav, f);
    return { audio: a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer, contentType: f === "pcm_16000" ? "audio/L16;rate=16000" : "audio/basic", chars: req.text.length };
  }

  async *stream(req: TtsRequest) {
    const wav = await this.gerarWav(req);
    const f = req.formato ?? "mp3";
    yield* emQuadros(f === "mp3" ? wav : converter(wav, f), f);
  }
}

/** VoiceStudio Local API (engine VoxCPM2 selected on the server; OmniVoice is non-commercial). */
export class MotorVoiceStudio extends MotorProprio {
  readonly name = "voicestudio";
  protected async gerarWav(req: TtsRequest) {
    const url = process.env.VOICESTUDIO_URL;
    if (!url) throw new TtsNotConfiguredError();
    const v = { ...DESIGN[req.voiceId], ...mapa("VOICESTUDIO_VOICE_MAP")[req.voiceId] };
    const fd = new FormData();
    fd.set("text", req.text);
    fd.set("language", "pt");
    if (v.instruct) fd.set("instruct", v.instruct);
    if (req.velocidade) fd.set("speed", String(req.velocidade));
    const r = await fetch(`${url.replace(/\/$/, "")}/generate`, {
      method: "POST",
      headers: process.env.VOICESTUDIO_API_KEY ? { authorization: `Bearer ${process.env.VOICESTUDIO_API_KEY}` } : {},
      body: fd,
      signal: req.signal ?? AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`VoiceStudio ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return new Uint8Array(await r.arrayBuffer());
  }
}

/** Fish Audio drama-3 served by vLLM-Omni / SGLang-Omni (OpenAI-compatible /v1/audio/speech). */
export class MotorDrama extends MotorProprio {
  readonly name = "drama";
  protected async gerarWav(req: TtsRequest) {
    const url = process.env.DRAMA_URL;
    if (!url) throw new TtsNotConfiguredError();
    const v = { ...DESIGN[req.voiceId], ...mapa("DRAMA_VOICE_MAP")[req.voiceId] };
    const r = await fetch(`${url.replace(/\/$/, "")}/v1/audio/speech`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.DRAMA_API_KEY ? { authorization: `Bearer ${process.env.DRAMA_API_KEY}` } : {}) },
      body: JSON.stringify({ model: process.env.DRAMA_MODEL ?? "fishaudio/drama-3", input: req.text, response_format: "wav", speed: req.velocidade ?? 1, ...v }),
      signal: req.signal ?? AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Drama ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return new Uint8Array(await r.arrayBuffer());
  }
}
