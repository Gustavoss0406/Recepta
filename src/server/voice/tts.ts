import "server-only";
import { getVoice } from "@/lib/voices";
import { MotorDrama, MotorVoiceStudio } from "./tts-proprio";

/**
 * Text-to-speech behind a provider-neutral interface. Voices are exposed only under our own
 * catalog names; the provider and its voice IDs never reach the client.
 */
export type FormatoAudio = "mp3" | "pcm_16000" | "ulaw_8000";

export interface TtsRequest {
  voiceId: string; // our catalog id (e.g. "lia")
  text: string;
  tier?: "padrao" | "ultra";
  formato?: FormatoAudio;
  velocidade?: number;
  signal?: AbortSignal;
}

export interface TtsEngine {
  readonly name: string;
  synthesize(req: TtsRequest): Promise<{ audio: ArrayBuffer; contentType: string; chars: number }>;
  /** Streams audio chunks as they are generated (low latency). */
  stream(req: TtsRequest): AsyncIterable<Uint8Array>;
}

export class TtsNotConfiguredError extends Error {
  constructor() {
    super("Motor de voz não configurado");
  }
}

function providerVoiceMap(): Record<string, string> {
  try {
    return JSON.parse(process.env.TTS_VOICE_MAP ?? "{}");
  } catch {
    return {};
  }
}

const FORMATOS: Record<FormatoAudio, { q: string; ct: string }> = {
  mp3: { q: "mp3_44100_128", ct: "audio/mpeg" },
  pcm_16000: { q: "pcm_16000", ct: "audio/L16;rate=16000" },
  ulaw_8000: { q: "ulaw_8000", ct: "audio/basic" },
};

class PremiumTtsEngine implements TtsEngine {
  readonly name = "premium";
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private models: { padrao: string; ultra: string },
  ) {}

  private request(req: TtsRequest, streaming: boolean) {
    const providerVoice = providerVoiceMap()[req.voiceId];
    if (!providerVoice) throw new TtsNotConfiguredError();
    const f = FORMATOS[req.formato ?? "mp3"];
    const path = streaming ? "/stream" : "";
    return fetch(`${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(providerVoice)}${path}?output_format=${f.q}`, {
      method: "POST",
      headers: { "xi-api-key": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        text: req.text,
        model_id: this.models[req.tier ?? "padrao"],
        language_code: "pt",
        // Lower stability + some style = more natural intonation on phone calls (defaults sound flat).
        voice_settings: {
          stability: Number(process.env.TTS_STABILITY ?? 0.38),
          similarity_boost: 0.8,
          style: Number(process.env.TTS_STYLE ?? 0.3),
          use_speaker_boost: true,
          ...(req.velocidade ? { speed: req.velocidade } : {}),
        },
      }),
      signal: req.signal,
    });
  }

  async synthesize(req: TtsRequest) {
    const res = await this.request(req, false);
    if (!res.ok) throw new Error(`TTS falhou: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return { audio: await res.arrayBuffer(), contentType: FORMATOS[req.formato ?? "mp3"].ct, chars: req.text.length };
  }

  async *stream(req: TtsRequest) {
    const res = await this.request(req, true);
    if (!res.ok || !res.body) throw new Error(`TTS falhou: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  }
}

/** Is the engine behind this voice (or the premium engine, when no voice is given) configured? */
export function ttsConfigurado(voiceId?: string): boolean {
  const motor = voiceId ? getVoice(voiceId)?.motor : "premium";
  if (motor === "voicestudio") return Boolean(process.env.VOICESTUDIO_URL);
  if (motor === "drama") return Boolean(process.env.DRAMA_URL);
  return Boolean(process.env.TTS_API_KEY) && Object.keys(providerVoiceMap()).length > 0;
}

/** Engine that speaks a given catalog voice. */
export function getTtsEngine(voiceId?: string): TtsEngine {
  const motor = voiceId ? getVoice(voiceId)?.motor : "premium";
  if (motor === "voicestudio") return new MotorVoiceStudio();
  if (motor === "drama") return new MotorDrama();
  const key = process.env.TTS_API_KEY;
  if (!key) throw new TtsNotConfiguredError();
  return new PremiumTtsEngine(key, process.env.TTS_BASE_URL ?? "https://api.elevenlabs.io", {
    padrao: process.env.TTS_MODEL_PADRAO || "eleven_v4_turbo",
    ultra: process.env.TTS_MODEL_ULTRA || "eleven_v4",
  });
}
