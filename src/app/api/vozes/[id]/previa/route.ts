import { getVoice } from "@/lib/voices";
import { getTtsEngine, TtsNotConfiguredError } from "@/server/voice/tts";

// Previews are static per voice: cache aggressively so each sample is synthesized once.
const cache = new Map<string, ArrayBuffer>();

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const voice = getVoice(id);
  if (!voice) return new Response("Voz não encontrada", { status: 404 });

  try {
    let audio = cache.get(id);
    if (!audio) {
      audio = (await getTtsEngine(id).synthesize({ voiceId: id, text: voice.sample })).audio;
      cache.set(id, audio);
    }
    return new Response(audio, {
      headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=86400" },
    });
  } catch (e) {
    if (e instanceof TtsNotConfiguredError) return new Response(e.message, { status: 503 });
    return new Response("Falha ao gerar prévia", { status: 502 });
  }
}
