import { exigirSessao } from "@/server/auth/session";
import { getVoice } from "@/lib/voices";
import { filtrarTags } from "@/lib/voz/tags";
import { getTtsEngine, ttsConfigurado } from "@/server/voice/tts";

/** Voice playground: speaks any text (with audio tags) in a catalog voice, with stability/style. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await ctx.params;
  if (!getVoice(id)) return new Response("Voz não encontrada", { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { texto?: string; estabilidade?: number; estilo?: number; ultra?: boolean };
  const texto = filtrarTags(String(b.texto ?? "").slice(0, 600), 4);
  if (!texto.trim()) return new Response("Escreva um texto.", { status: 400 });
  if (!ttsConfigurado(id)) return new Response("Motor desta voz não conectado.", { status: 503 });
  const lim = (x: unknown, padrao: number) => (typeof x === "number" && x >= 0 && x <= 1 ? x : padrao);
  try {
    const { audio, contentType } = await getTtsEngine(id).synthesize({
      voiceId: id,
      text: texto,
      tier: b.ultra === false ? "padrao" : "ultra",
      formato: "mp3",
      expressao: { estabilidade: lim(b.estabilidade, 0.38), estilo: lim(b.estilo, 0.3) },
    });
    return new Response(audio, { headers: { "content-type": contentType } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message.slice(0, 200) : "erro", { status: 502 });
  }
}
