import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { sha256 } from "./tokens";

/** Authorization: Bearer rk_xxxxxxxx.<secret> → organization id (or null). */
export async function orgDaChave(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(rk_[\w-]+)\.([\w-]+)$/);
  if (!m) return null;
  const [k] = await getDb()
    .select()
    .from(schema.chavesApi)
    .where(and(eq(schema.chavesApi.prefixo, m[1]), eq(schema.chavesApi.hash, sha256(m[2])), isNull(schema.chavesApi.revogadaEm)));
  if (!k) return null;
  await getDb().update(schema.chavesApi).set({ ultimoUso: new Date() }).where(eq(schema.chavesApi.id, k.id));
  return k.orgId;
}

export const naoAutorizado = () => Response.json({ erro: "chave de API inválida" }, { status: 401 });
