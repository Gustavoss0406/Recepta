import { exigirSessao } from "@/server/auth/session";
import { getTtsEngine, ttsConfigurado } from "@/server/voice/tts";
import { filtrarTags } from "@/lib/voz/tags";

/** The Recepta's own voice in the onboarding: the best model, expressive settings and audio tags. */
const VOZ = process.env.RECEPTA_ONBOARDING_VOZ || "lia";

export async function POST(req: Request) {
  await exigirSessao();
  const { texto } = (await req.json().catch(() => ({}))) as { texto?: string };
  const t = filtrarTags(String(texto ?? "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").slice(0, 900), 3);
  if (!t.trim()) return new Response("texto vazio", { status: 400 });
  if (!ttsConfigurado(VOZ)) return new Response("voz indisponível", { status: 503 });
  try {
    const { audio, contentType } = await getTtsEngine(VOZ).synthesize({ voiceId: VOZ, text: t, tier: "ultra", formato: "mp3", velocidade: 1.04, expressao: { estabilidade: 0.3, estilo: 0.55 } });
    return new Response(audio, { headers: { "content-type": contentType, "cache-control": "private, max-age=3600" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "erro", { status: 502 });
  }
}
