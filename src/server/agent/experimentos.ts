import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ErroAgente, obterAgente, restaurarVersao } from "./agentes";
import type { Papel } from "@/db/schema";

export const PLANOS_COM_AB = ["business"];

async function ativo(agenteId: string) {
  const [e] = await getDb()
    .select()
    .from(schema.experimentos)
    .where(and(eq(schema.experimentos.agenteId, agenteId), eq(schema.experimentos.status, "ativo")))
    .limit(1);
  return e ?? null;
}

/** Version a new real call should run: the published one, or B for the experiment's share of traffic. */
export async function versaoParaNovaChamada(orgId: string, agenteId: string, sorteio = Math.random()): Promise<string> {
  const a = await obterAgente(orgId, agenteId);
  if (!a.versaoPublicadaId) throw new ErroAgente("Este agente ainda não foi publicado.");
  const e = await ativo(agenteId);
  if (e && e.versaoA === a.versaoPublicadaId && sorteio * 100 < e.percentualB) return e.versaoB;
  return a.versaoPublicadaId;
}

export async function iniciarExperimento(orgId: string, agenteId: string, versaoB: string, percentualB: number) {
  const a = await obterAgente(orgId, agenteId);
  if (!a.versaoPublicadaId) throw new ErroAgente("Publique uma versão antes de criar um experimento.");
  if (versaoB === a.versaoPublicadaId) throw new ErroAgente("Escolha uma versão diferente da que está no ar.");
  const [v] = await getDb().select().from(schema.agenteVersoes).where(and(eq(schema.agenteVersoes.id, versaoB), eq(schema.agenteVersoes.agenteId, agenteId)));
  if (!v) throw new ErroAgente("Versão não encontrada");
  if (await ativo(agenteId)) throw new ErroAgente("Já existe um experimento em andamento.");
  const p = Math.round(Math.min(90, Math.max(10, percentualB)));
  const [e] = await getDb().insert(schema.experimentos).values({ orgId, agenteId, versaoA: a.versaoPublicadaId, versaoB, percentualB: p }).returning();
  return e;
}

export async function encerrarExperimento(orgId: string, agenteId: string, opts: { promover?: "A" | "B"; autor?: { id: string; papel: Papel } } = {}) {
  const e = await ativo(agenteId);
  if (!e || e.orgId !== orgId) throw new ErroAgente("Nenhum experimento em andamento.");
  const vencedora = opts.promover === "B" ? e.versaoB : opts.promover === "A" ? e.versaoA : null;
  await getDb()
    .update(schema.experimentos)
    .set({ status: "encerrado", encerradoEm: new Date(), vencedora })
    .where(eq(schema.experimentos.id, e.id));
  // Promoting B republishes it (new version number, same config), so the change is in the history.
  if (opts.promover === "B" && opts.autor) await restaurarVersao(orgId, agenteId, e.versaoB, opts.autor);
  return { ...e, vencedora };
}

export interface ResultadoVariante {
  versaoId: string;
  numero: number;
  ligacoes: number;
  resolvidas: number;
  sucesso: number;
  repassadas: number;
}

/** Real calls since the experiment started, per arm. */
export async function resultadoExperimento(agenteId: string) {
  const e = await ativo(agenteId);
  if (!e) return null;
  const c = schema.conversas;
  const linhas = await getDb()
    .select({
      versaoId: c.versaoId,
      numero: schema.agenteVersoes.numero,
      ligacoes: sql<number>`count(*)::int`,
      resolvidas: sql<number>`count(*) filter (where ${c.resultado} = 'resolvido')::int`,
      sucesso: sql<number>`count(*) filter (where (${c.avaliacao}->>'sucesso')::boolean)::int`,
      repassadas: sql<number>`count(*) filter (where ${c.resultado} in ('repassado', 'recado'))::int`,
    })
    .from(c)
    .innerJoin(schema.agenteVersoes, eq(schema.agenteVersoes.id, c.versaoId))
    .where(and(eq(c.agenteId, agenteId), eq(c.teste, false), eq(c.status, "encerrada"), sql`${c.iniciadaEm} >= ${e.criadoEm}`, sql`${c.versaoId} in (${e.versaoA}, ${e.versaoB})`))
    .groupBy(c.versaoId, schema.agenteVersoes.numero);
  const numeros = await getDb()
    .select({ id: schema.agenteVersoes.id, numero: schema.agenteVersoes.numero })
    .from(schema.agenteVersoes)
    .where(sql`${schema.agenteVersoes.id} in (${e.versaoA}, ${e.versaoB})`);
  const de = (id: string): ResultadoVariante => {
    const l = linhas.find((x) => x.versaoId === id);
    return { versaoId: id, numero: numeros.find((n) => n.id === id)?.numero ?? 0, ligacoes: l?.ligacoes ?? 0, resolvidas: l?.resolvidas ?? 0, sucesso: l?.sucesso ?? 0, repassadas: l?.repassadas ?? 0 };
  };
  return { experimento: e, a: de(e.versaoA), b: de(e.versaoB) };
}
