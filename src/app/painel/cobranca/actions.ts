"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";
import { definirTeto } from "@/server/billing/assinaturas";
import { assinarPlano, registrarPagamento } from "@/server/billing/faturamento";
import { getPagamentos } from "@/server/providers/pagamentos";
import type { PlanId } from "@/lib/pricing/plans";

export type R = { ok?: boolean; erro?: string; mensagem?: string } | undefined;

export async function escolherPlano(_: R, fd: FormData): Promise<R> {
  const s = await exigirPermissao("gerenciarCobranca");
  const plano = String(fd.get("plano")) as PlanId;
  const ciclo = fd.get("ciclo") === "anual" ? "anual" : "mensal";
  if (!["start", "pro", "business"].includes(plano)) return { erro: "Plano inválido" };
  const f = await assinarPlano(s.org.id, plano, ciclo);
  await getDb().insert(schema.auditoria).values({ orgId: s.org.id, usuarioId: s.usuario.id, acao: "plano.alterado", detalhes: { plano, ciclo } });
  revalidatePath("/painel", "layout");
  if (f.linkPagamento?.startsWith("/")) redirect(f.linkPagamento);
  return { ok: true, mensagem: "Plano alterado. A fatura foi enviada." };
}

export async function salvarLimites(_: R, fd: FormData): Promise<R> {
  await exigirPermissao("gerenciarCobranca").then(async (s) => {
    const teto = String(fd.get("teto") ?? "").replace(",", ".").trim();
    await definirTeto(s.org.id, teto ? Number(teto) : null, fd.get("pico") === "on");
  });
  revalidatePath("/painel/cobranca");
  return { ok: true, mensagem: "Limites salvos" };
}

/** Payment simulator — only active when no gateway key is configured. */
export async function pagarSimulado(faturaId: string) {
  const s = await exigirPermissao("verCobranca");
  if (getPagamentos().real) throw new Error("Pagamento simulado desativado: gateway real configurado.");
  const [f] = await getDb()
    .select()
    .from(schema.faturas)
    .where(and(eq(schema.faturas.orgId, s.org.id), eq(schema.faturas.id, faturaId)));
  if (!f) throw new Error("Fatura não encontrada");
  await registrarPagamento(f.id);
  revalidatePath("/painel", "layout");
  redirect("/painel/cobranca?pago=1");
}
