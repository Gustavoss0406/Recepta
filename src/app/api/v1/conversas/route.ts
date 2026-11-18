import { and, desc, eq, gte, lt } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { naoAutorizado, orgDaChave } from "@/server/auth/api-key";
import { serializar } from "@/server/api/serializar";

/** GET /api/v1/conversas?agente=&resultado=&desde=ISO&antes=ISO&limite=50 (real calls only). */
export async function GET(req: Request) {
  const orgId = await orgDaChave(req);
  if (!orgId) return naoAutorizado();
  const u = new URL(req.url);
  const c = schema.conversas;
  const filtros = [eq(c.orgId, orgId), eq(c.teste, false)];
  const ag = u.searchParams.get("agente");
  if (ag) filtros.push(eq(c.agenteId, ag));
  const res = u.searchParams.get("resultado");
  if (res) filtros.push(eq(c.resultado, res as "resolvido"));
  const desde = u.searchParams.get("desde");
  if (desde) filtros.push(gte(c.iniciadaEm, new Date(desde)));
  const antes = u.searchParams.get("antes");
  if (antes) filtros.push(lt(c.iniciadaEm, new Date(antes)));
  const limite = Math.min(Number(u.searchParams.get("limite") ?? 50), 200);
  const rows = await getDb().select().from(c).where(and(...filtros)).orderBy(desc(c.iniciadaEm)).limit(limite);
  return Response.json({ dados: rows.map(serializar), proximo_antes: rows.length === limite ? rows.at(-1)!.iniciadaEm : null });
}
