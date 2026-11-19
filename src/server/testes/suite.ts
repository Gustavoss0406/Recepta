import { paciencia } from "@/server/providers/llm-rotacao";
import { orgIlimitada } from "@/server/billing/ilimitado";
import "server-only";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Severidade } from "@/db/schema";
import { getNicho } from "@/lib/niches";
import type { Nicho } from "@/lib/agent/config";
import { SIMULACOES_POR_PLANO } from "@/lib/billing/ciclo";
import type { PlanId } from "@/lib/pricing/plans";
import { obterAgente, type ResultadoGate } from "@/server/agent/agentes";
import { obterAssinatura } from "@/server/billing/assinaturas";
import { emitirEvento } from "@/server/integracoes/eventos";
import {
  rodarChamadaAcao,
  rodarProximaResposta,
  rodarSimulacao,
  type ConfigChamadaAcao,
  type ConfigProximaResposta,
  type ConfigSimulacao,
  type Rodada,
} from "./simulacao";

/** Seeds the niche's scenario library for an agent (idempotent). */
export async function garantirCasosPadrao(orgId: string, agenteId: string) {
  const db = getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.casosTeste).where(eq(schema.casosTeste.agenteId, agenteId));
  if (n > 0) return;
  const a = await obterAgente(orgId, agenteId);
  const cen = getNicho(a.nicho as Nicho).cenarios;
  await db.insert(schema.casosTeste).values(
    cen.map((c) => ({
      orgId,
      agenteId,
      tipo: "simulacao" as const,
      nome: c.nome,
      severidade: c.severidade,
      config: { persona: c.persona, objetivo: c.objetivo, criterio: c.criterio, maxTurnos: c.maxTurnos, mockAgenda: c.mockAgenda } satisfies ConfigSimulacao,
    })),
  );
}

export class LimiteSimulacoes extends Error {}

async function verificarCota(orgId: string, rodadas: number) {
  if (orgIlimitada(orgId)) return;
  const a = await obterAssinatura(orgId);
  const [{ usadas }] = await getDb()
    .select({ usadas: sql<number>`coalesce(sum(${schema.execucoesTeste.rodadas}), 0)::int` })
    .from(schema.execucoesTeste)
    .where(and(eq(schema.execucoesTeste.orgId, orgId), gte(schema.execucoesTeste.criadoEm, a.inicioCiclo)));
  const limite = SIMULACOES_POR_PLANO[a.planoId as PlanId];
  if (Number(usadas) + rodadas > limite) throw new LimiteSimulacoes(`Limite de ${limite} execuções de teste no ciclo atingido.`);
}

async function rodarCaso(orgId: string, agenteId: string, caso: typeof schema.casosTeste.$inferSelect): Promise<Rodada> {
  switch (caso.tipo) {
    case "simulacao":
      return rodarSimulacao(orgId, agenteId, caso.config as ConfigSimulacao);
    case "proxima_resposta":
      return rodarProximaResposta(orgId, agenteId, caso.config as ConfigProximaResposta);
    case "chamada_acao":
      return rodarChamadaAcao(orgId, agenteId, caso.config as ConfigChamadaAcao);
  }
}

/** Runs one case N times (probabilistic testing) against the draft and stores the pass rate. */
export async function executarCaso(orgId: string, casoId: string, rodadas = 3) {
  const db = getDb();
  const [caso] = await db.select().from(schema.casosTeste).where(and(eq(schema.casosTeste.orgId, orgId), eq(schema.casosTeste.id, casoId)));
  if (!caso) throw new Error("Teste não encontrado");
  await verificarCota(orgId, rodadas);
  const [ex] = await db
    .insert(schema.execucoesTeste)
    .values({ orgId, casoId, agenteId: caso.agenteId, alvo: "rascunho", rodadas, status: "rodando" })
    .returning();
  try {
    // one run at a time, waiting up to 3 min for free-tier limits to reset (instead of failing as "erro")
    const resultados: Rodada[] = [];
    for (let i = 0; i < rodadas; i++) resultados.push(await paciencia.run({ ateMs: 180_000 }, () => rodarCaso(orgId, caso.agenteId, caso)));
    const aprovadas = resultados.filter((r) => r.aprovado).length;
    const [fim] = await db
      .update(schema.execucoesTeste)
      .set({ status: "concluida", aprovadas, detalhes: { rodadas: resultados } })
      .where(eq(schema.execucoesTeste.id, ex.id))
      .returning();
    if (aprovadas < rodadas) await emitirEvento(orgId, "test.failed", { casoId, nome: caso.nome, aprovadas, rodadas });
    return fim;
  } catch (e) {
    await db
      .update(schema.execucoesTeste)
      .set({ status: "erro", detalhes: { erro: e instanceof Error ? e.message : String(e) } })
      .where(eq(schema.execucoesTeste.id, ex.id));
    throw e;
  }
}

export async function executarSuite(orgId: string, agenteId: string, opts: { severidades?: Severidade[]; rodadas?: number } = {}) {
  await garantirCasosPadrao(orgId, agenteId);
  const casos = await getDb()
    .select()
    .from(schema.casosTeste)
    .where(
      and(
        eq(schema.casosTeste.agenteId, agenteId),
        eq(schema.casosTeste.orgId, orgId),
        ...(opts.severidades ? [inArray(schema.casosTeste.severidade, opts.severidades)] : []),
      ),
    );
  const out: Awaited<ReturnType<typeof executarCaso>>[] = [];
  // two cases at a time: free engines allow a few dozen requests per minute
  for (let i = 0; i < casos.length; i += 2) out.push(...(await Promise.all(casos.slice(i, i + 2).map((c) => executarCaso(orgId, c.id, opts.rodadas ?? 1)))));
  return casos.map((c, i) => ({ caso: c, execucao: out[i] }));
}

/** Publish gate: every critical case must pass on the current draft. */
export async function rodarGatePublicacao(orgId: string, agenteId: string): Promise<ResultadoGate> {
  const r = await executarSuite(orgId, agenteId, { severidades: ["critico"], rodadas: 1 });
  const demo = r.some((x) => ((x.execucao.detalhes as { rodadas?: { demo?: boolean }[] } | null)?.rodadas ?? []).some((d) => d.demo));
  if (demo)
    return { aprovado: true, falhasCriticas: [], resumo: `${r.length} testes críticos rodados sem avaliação (modo demonstração)` };
  const falhas = r
    .filter((x) => x.execucao.aprovadas < x.execucao.rodadas)
    .map((x) => ({ caso: x.caso.nome, aprovadas: x.execucao.aprovadas, rodadas: x.execucao.rodadas }));
  return {
    aprovado: falhas.length === 0,
    falhasCriticas: falhas,
    resumo: falhas.length ? `${falhas.length} teste(s) crítico(s) reprovado(s): ${falhas.map((f) => f.caso).join(", ")}` : `${r.length} testes críticos aprovados`,
  };
}

export async function ultimasExecucoes(orgId: string, agenteId: string) {
  return getDb()
    .select()
    .from(schema.execucoesTeste)
    .where(and(eq(schema.execucoesTeste.orgId, orgId), eq(schema.execucoesTeste.agenteId, agenteId)))
    .orderBy(desc(schema.execucoesTeste.criadoEm))
    .limit(200);
}
