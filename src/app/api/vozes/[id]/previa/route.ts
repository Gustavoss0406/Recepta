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
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[prévia ${id}]`, msg);
    if (e instanceof TtsNotConfiguredError)
      return new Response(
        voice.motor === "premium"
          ? "Motor de voz não configurado: preencha TTS_API_KEY no .env.local e reinicie (npm run local)."
          : "Esta voz usa um motor próprio que ainda não está conectado. Escolha uma voz do grupo Premium.",
        { status: 503 },
      );
    const status = Number(msg.match(/TTS falhou: (\d{3})/)?.[1] ?? 0);
    const motivo =
      status === 401
        ? "A ElevenLabs recusou a chave (TTS_API_KEY). Confira se copiou a chave inteira e se ela tem permissão de Text to Speech."
        : status === 402
          ? "Sua conta da ElevenLabs não tem créditos ou o plano não permite esta voz."
          : status === 404
            ? "A voz configurada não existe nesta conta da ElevenLabs (TTS_VOICE_MAP)."
            : `Falha ao gerar a prévia: ${msg.slice(0, 160)}`;
    return new Response(motivo, { status: 502 });
  }
}
