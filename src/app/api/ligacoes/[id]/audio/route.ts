import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { lerSessao, pode } from "@/server/auth/session";
import { lerAudio } from "@/server/audio/armazenamento";

/** Streams a call recording to members of the owning organization (Range supported for seeking). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await lerSessao();
  if (!s?.org || !s.papel || !pode(s.papel, "verLigacoes")) return new Response("Não autorizado", { status: 401 });
  const { id } = await params;
  const [c] = await getDb()
    .select({ chave: schema.conversas.audioChave })
    .from(schema.conversas)
    .where(and(eq(schema.conversas.orgId, s.org.id), eq(schema.conversas.id, id)));
  if (!c?.chave) return new Response("Sem gravação", { status: 404 });
  const dados = await lerAudio(c.chave);
  if (!dados) return new Response("Sem gravação", { status: 404 });

  const base = {
    "content-type": "audio/wav",
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    ...(new URL(req.url).searchParams.has("baixar") ? { "content-disposition": `attachment; filename="ligacao-${id.slice(0, 8)}.wav"` } : {}),
  };
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const ini = range[1] ? Number(range[1]) : 0;
    const fim = range[2] ? Math.min(Number(range[2]), dados.length - 1) : dados.length - 1;
    if (ini > fim || ini >= dados.length) return new Response(null, { status: 416, headers: { "content-range": `bytes */${dados.length}` } });
    return new Response(new Uint8Array(dados.subarray(ini, fim + 1)), {
      status: 206,
      headers: { ...base, "content-range": `bytes ${ini}-${fim}/${dados.length}`, "content-length": String(fim - ini + 1) },
    });
  }
  return new Response(new Uint8Array(dados), { headers: { ...base, "content-length": String(dados.length) } });
}
