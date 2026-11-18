import "server-only";
import { and, eq, inArray, lt, lte } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { DIAS_ATE_SUSPENDER, fimDoCiclo, itensFatura, totalCentavos, type ItemFatura } from "@/lib/billing/ciclo";
import type { PlanId } from "@/lib/pricing/plans";
import { getPagamentos } from "@/server/providers/pagamentos";
import { trocarPlano, usoDoCiclo } from "./assinaturas";

const VENCIMENTO_DIAS = 3;

async function emitirFatura(orgId: string, itens: ItemFatura[], cicloInicio: Date, cicloFim: Date, agora: Date) {
  const total = totalCentavos(itens);
  const db = getDb();
  const [f] = await db
    .insert(schema.faturas)
    .values({
      orgId,
      cicloInicio,
      cicloFim,
      itens,
      totalCentavos: total,
      vencimento: new Date(agora.getTime() + VENCIMENTO_DIAS * 86_400_000),
      status: total === 0 ? "paga" : "aberta",
      pagoEm: total === 0 ? agora : null,
    })
    .returning();
  if (total === 0) return f;

  const pg = getPagamentos();
  const [org] = await db.select().from(schema.organizacoes).where(eq(schema.organizacoes.id, orgId));
  let clienteId = org.asaasClienteId;
  if (!clienteId) {
    const [dono] = await db
      .select({ email: schema.usuarios.email })
      .from(schema.membros)
      .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.membros.usuarioId))
      .where(and(eq(schema.membros.orgId, orgId), eq(schema.membros.papel, "dono")));
    clienteId = await pg.garantirCliente({ id: orgId, nome: org.nome, cnpj: org.cnpj, email: dono?.email ?? "" });
    await db.update(schema.organizacoes).set({ asaasClienteId: clienteId }).where(eq(schema.organizacoes.id, orgId));
  }
  const cob = await pg.criarCobranca({ clienteId, valorCentavos: total, vencimento: f.vencimento, descricao: `Recepta · ${itens.map((i) => i.descricao).join(", ")}`, referencia: f.id });
  const [atualizada] = await db
    .update(schema.faturas)
    .set({ asaasCobrancaId: cob.id, linkPagamento: cob.linkPagamento, pixCopiaCola: cob.pixCopiaCola })
    .where(eq(schema.faturas.id, f.id))
    .returning();
  return atualizada;
}

/** Subscribing (or changing plan): charge the new cycle's plan price upfront, minus the pro-rata credit. */
export async function assinarPlano(orgId: string, plano: PlanId, ciclo: "mensal" | "anual", agora = new Date()) {
  const { creditoProRataBrl } = await trocarPlano(orgId, plano, ciclo, agora);
  const itens = itensFatura(plano, ciclo, { minutos: 0, minutosPico: 0, minutosTeste: 0 }, creditoProRataBrl);
  return emitirFatura(orgId, itens, agora, fimDoCiclo(agora, ciclo), agora);
}

/**
 * Closes every paid cycle that ended: bills overage/peak of the ended cycle together with the next
 * cycle's plan price, then rolls the cycle forward.
 */
export async function fecharCiclosVencidos(agora = new Date()) {
  const db = getDb();
  const vencidas = await db
    .select()
    .from(schema.assinaturas)
    .where(and(lte(schema.assinaturas.fimCiclo, agora), inArray(schema.assinaturas.status, ["ativa", "inadimplente"])));
  const faturas = [];
  for (const a of vencidas) {
    const uso = await usoDoCiclo(a.orgId, a.inicioCiclo, a.fimCiclo);
    const encerrado = itensFatura(a.planoId as PlanId, a.ciclo, uso).slice(1); // overage + peak only
    const proximo = itensFatura(a.planoId as PlanId, a.ciclo, { minutos: 0, minutosPico: 0, minutosTeste: 0 });
    const novoInicio = a.fimCiclo;
    const novoFim = fimDoCiclo(novoInicio, a.ciclo);
    faturas.push(await emitirFatura(a.orgId, [...encerrado, ...proximo], a.inicioCiclo, a.fimCiclo, agora));
    await db.update(schema.assinaturas).set({ inicioCiclo: novoInicio, fimCiclo: novoFim }).where(eq(schema.assinaturas.id, a.id));
  }
  return faturas;
}

/** Overdue → delinquent (alert) → suspended after DIAS_ATE_SUSPENDER days. */
export async function processarInadimplencia(agora = new Date()) {
  const db = getDb();
  const atrasadas = await db
    .update(schema.faturas)
    .set({ status: "vencida" })
    .where(and(eq(schema.faturas.status, "aberta"), lt(schema.faturas.vencimento, agora)))
    .returning();
  for (const f of atrasadas) {
    await db.update(schema.assinaturas).set({ status: "inadimplente" }).where(and(eq(schema.assinaturas.orgId, f.orgId), eq(schema.assinaturas.status, "ativa")));
    await db
      .insert(schema.alertas)
      .values({ orgId: f.orgId, tipo: "inadimplencia", cicloInicio: f.cicloInicio, mensagem: "Há uma fatura vencida. Pague para evitar a suspensão do agente." })
      .onConflictDoNothing();
  }
  const limite = new Date(agora.getTime() - DIAS_ATE_SUSPENDER * 86_400_000);
  const graves = await db
    .select({ orgId: schema.faturas.orgId })
    .from(schema.faturas)
    .where(and(eq(schema.faturas.status, "vencida"), lt(schema.faturas.vencimento, limite)));
  for (const g of graves) await db.update(schema.assinaturas).set({ status: "suspensa" }).where(eq(schema.assinaturas.orgId, g.orgId));
  return { vencidas: atrasadas.length, suspensas: graves.length };
}

/** Payment confirmed (gateway webhook or simulator): mark paid and reactivate if nothing else is overdue. */
export async function registrarPagamento(faturaId: string, agora = new Date()) {
  const db = getDb();
  const [f] = await db
    .update(schema.faturas)
    .set({ status: "paga", pagoEm: agora })
    .where(and(eq(schema.faturas.id, faturaId), inArray(schema.faturas.status, ["aberta", "vencida"])))
    .returning();
  if (!f) return null;
  const pendentes = await db
    .select({ id: schema.faturas.id })
    .from(schema.faturas)
    .where(and(eq(schema.faturas.orgId, f.orgId), eq(schema.faturas.status, "vencida")));
  if (!pendentes.length)
    await db
      .update(schema.assinaturas)
      .set({ status: "ativa" })
      .where(and(eq(schema.assinaturas.orgId, f.orgId), inArray(schema.assinaturas.status, ["inadimplente", "suspensa"])));
  return f;
}
