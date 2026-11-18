import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { extrairFatos, fatiar, type Fatos } from "@/server/crawler/extrair";
import { rastrearSite } from "@/server/crawler/crawl";

export interface TrechoEncontrado {
  texto: string;
  origem: string | null;
  rank: number;
}

/** Portuguese full-text search: AND query first, OR fallback for long spoken questions. */
export async function buscarConhecimento(agenteId: string, consulta: string, limite = 4): Promise<TrechoEncontrado[]> {
  const db = getDb();
  const t = schema.trechos;
  const q = consulta.trim();
  if (!q) return [];
  const rodar = async (tsq: ReturnType<typeof sql>) =>
    db
      .select({ texto: t.texto, origem: t.origem, rank: sql<number>`ts_rank(${t.tsv}, ${tsq})` })
      .from(t)
      .where(and(eq(t.agenteId, agenteId), sql`${t.tsv} @@ ${tsq}`))
      .orderBy(sql`ts_rank(${t.tsv}, ${tsq}) desc`)
      .limit(limite);
  let r = await rodar(sql`websearch_to_tsquery('portuguese', ${q})`);
  if (!r.length) {
    const termos = q
      .toLowerCase()
      .normalize("NFC")
      .match(/[\p{L}\d]{3,}/gu);
    if (termos?.length) {
      const ou = termos.join(" OR ");
      r = await rodar(sql`websearch_to_tsquery('portuguese', ${ou})`);
    }
  }
  return r.map((x) => ({ ...x, rank: Number(x.rank) }));
}

export async function adicionarTexto(orgId: string, agenteId: string, titulo: string, texto: string, tipo: "texto" | "faq" = "texto") {
  const db = getDb();
  const [f] = await db
    .insert(schema.fontesConhecimento)
    .values({ orgId, agenteId, tipo, titulo, status: "pronto", paginas: 1 })
    .returning();
  const partes = fatiar(texto);
  if (partes.length)
    await db.insert(schema.trechos).values(partes.map((p) => ({ orgId, agenteId, fonteId: f.id, origem: titulo, texto: p })));
  return f;
}

export async function removerFonte(orgId: string, fonteId: string) {
  const db = getDb();
  await db.delete(schema.trechos).where(and(eq(schema.trechos.orgId, orgId), eq(schema.trechos.fonteId, fonteId)));
  await db.delete(schema.fontesConhecimento).where(and(eq(schema.fontesConhecimento.orgId, orgId), eq(schema.fontesConhecimento.id, fonteId)));
}

export interface ResultadoSite {
  fonteId: string;
  paginas: number;
  fatos: Fatos;
  titulo: string;
  descricao: string;
  textoPrincipal: string;
}

/** Crawls the site, replaces the previous site source, indexes chunks and returns heuristic facts. */
export async function indexarSite(orgId: string, agenteId: string, url: string): Promise<ResultadoSite> {
  const db = getDb();
  const existentes = await db
    .select({ id: schema.fontesConhecimento.id })
    .from(schema.fontesConhecimento)
    .where(and(eq(schema.fontesConhecimento.agenteId, agenteId), eq(schema.fontesConhecimento.tipo, "site")));
  for (const e of existentes) await removerFonte(orgId, e.id);

  const [f] = await db
    .insert(schema.fontesConhecimento)
    .values({ orgId, agenteId, tipo: "site", titulo: url, url, status: "indexando" })
    .returning();
  try {
    const { paginas } = await rastrearSite(url);
    const linhas: { orgId: string; agenteId: string; fonteId: string; origem: string; texto: string }[] = [];
    for (const p of paginas)
      for (const parte of fatiar(`${p.titulo}\n${p.texto}`)) linhas.push({ orgId, agenteId, fonteId: f.id, origem: p.url, texto: parte });
    for (let i = 0; i < linhas.length; i += 200) await db.insert(schema.trechos).values(linhas.slice(i, i + 200));
    await db
      .update(schema.fontesConhecimento)
      .set({ status: "pronto", paginas: paginas.length, titulo: paginas[0].titulo || url, atualizadoEm: new Date() })
      .where(eq(schema.fontesConhecimento.id, f.id));
    const todo = paginas.map((p) => p.texto).join("\n");
    return {
      fonteId: f.id,
      paginas: paginas.length,
      fatos: extrairFatos(todo),
      titulo: paginas[0].titulo,
      descricao: paginas[0].descricao,
      textoPrincipal: todo.slice(0, 14_000),
    };
  } catch (e) {
    await db
      .update(schema.fontesConhecimento)
      .set({ status: "erro", erro: e instanceof Error ? e.message : "Erro ao ler o site" })
      .where(eq(schema.fontesConhecimento.id, f.id));
    throw e;
  }
}
