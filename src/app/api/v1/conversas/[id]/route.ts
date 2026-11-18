import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { naoAutorizado, orgDaChave } from "@/server/auth/api-key";
import { serializar } from "@/server/api/serializar";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const orgId = await orgDaChave(req);
  if (!orgId) return naoAutorizado();
  const { id } = await ctx.params;
  const db = getDb();
  const [c] = await db
    .select()
    .from(schema.conversas)
    .where(and(eq(schema.conversas.orgId, orgId), eq(schema.conversas.id, id)));
  if (!c) return Response.json({ erro: "não encontrada" }, { status: 404 });
  const turnos = await db.select().from(schema.turnos).where(eq(schema.turnos.conversaId, id)).orderBy(asc(schema.turnos.ordem));
  const acoes = await db.select().from(schema.chamadasFerramenta).where(eq(schema.chamadasFerramenta.conversaId, id));
  return Response.json({
    ...serializar(c),
    transcricao: turnos.map((t) => ({ papel: t.papel, texto: t.texto, offset_ms: t.offsetMs })),
    acoes: acoes.map((a) => ({ nome: a.nome, argumentos: a.args, resultado: a.resultado })),
    avaliacao: c.avaliacao,
  });
}
