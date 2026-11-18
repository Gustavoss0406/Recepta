import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/db/client";
import {
  creditoProRata,
  estadoFranquia,
  fimDoCiclo,
  itensFatura,
  minutosFranquia,
  TRIAL_DIAS,
  totalCentavos,
  type UsoCiclo,
} from "@/lib/billing/ciclo";
import { getPlan, type PlanId } from "@/lib/pricing/plans";

type Tx = Pick<Db, "insert" | "select" | "update">;

export async function iniciarTrial(orgId: string, tx: Tx = getDb(), agora = new Date()) {
  const fim = new Date(agora.getTime() + TRIAL_DIAS * 86_400_000);
  await tx.insert(schema.assinaturas).values({
    orgId,
    planoId: "teste",
    ciclo: "mensal",
    status: "trial",
    inicioCiclo: agora,
    fimCiclo: fim,
    trialFim: fim,
  });
}

export async function obterAssinatura(orgId: string) {
  const [a] = await getDb().select().from(schema.assinaturas).where(eq(schema.assinaturas.orgId, orgId)).limit(1);
  if (!a) throw new Error("Assinatura não encontrada");
  return a;
}

/** Usage in [inicio, fim): billable real-call minutes, peak minutes and test minutes. */
export async function usoDoCiclo(orgId: string, inicio: Date, fim: Date): Promise<UsoCiclo> {
  const c = schema.conversas;
  const [r] = await getDb()
    .select({
      minutos: sql<number>`coalesce(sum(case when ${c.teste} = false and ${c.pico} = false then ${c.minutosCobrados} else 0 end), 0)::int`,
      minutosPico: sql<number>`coalesce(sum(case when ${c.teste} = false and ${c.pico} = true then ${c.minutosCobrados} else 0 end), 0)::int`,
      minutosTeste: sql<number>`coalesce(sum(case when ${c.teste} = true and ${c.canal} in ('teste_voz', 'simulador') then ${c.minutosCobrados} else 0 end), 0)::int`,
    })
    .from(c)
    .where(and(eq(c.orgId, orgId), gte(c.iniciadaEm, inicio), lt(c.iniciadaEm, fim)));
  return { minutos: Number(r.minutos), minutosPico: Number(r.minutosPico), minutosTeste: Number(r.minutosTeste) };
}

export async function resumoCobranca(orgId: string, agora = new Date()) {
  const a = await obterAssinatura(orgId);
  const uso = await usoDoCiclo(orgId, a.inicioCiclo, a.fimCiclo);
  const plano = getPlan(a.planoId as PlanId);
  const incluidos = plano.includedMinutes * (a.ciclo === "anual" ? 12 : 1);
  const itens = itensFatura(a.planoId as PlanId, a.ciclo, uso);
  return {
    assinatura: a,
    plano,
    uso,
    incluidos,
    usadosFranquia: minutosFranquia(uso),
    estado: estadoFranquia(a.planoId as PlanId, a.ciclo, uso, a.tetoBrl),
    parcialCentavos: totalCentavos(itens),
    itens,
    agora,
  };
}

/** Upgrade/downgrade now: new cycle starts today; unused share of the old price is credited on the first invoice. */
export async function trocarPlano(orgId: string, novo: PlanId, ciclo: "mensal" | "anual", agora = new Date()) {
  if (novo === "teste" || novo === "enterprise") throw new Error("Plano indisponível para troca automática");
  const a = await obterAssinatura(orgId);
  const credito =
    a.status === "trial" ? 0 : creditoProRata(getPlan(a.planoId as PlanId), a.ciclo, a.inicioCiclo, a.fimCiclo, agora);
  await getDb()
    .update(schema.assinaturas)
    .set({
      planoId: novo,
      ciclo,
      status: "ativa",
      inicioCiclo: agora,
      fimCiclo: fimDoCiclo(agora, ciclo),
      trialFim: null,
    })
    .where(eq(schema.assinaturas.orgId, orgId));
  return { creditoProRataBrl: credito };
}

export async function definirTeto(orgId: string, tetoBrl: number | null, picoHabilitado?: boolean) {
  await getDb()
    .update(schema.assinaturas)
    .set({ tetoBrl, ...(picoHabilitado === undefined ? {} : { picoHabilitado }) })
    .where(eq(schema.assinaturas.orgId, orgId));
}
