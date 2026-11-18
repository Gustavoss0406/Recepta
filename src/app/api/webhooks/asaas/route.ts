import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { registrarPagamento } from "@/server/billing/faturamento";

function tokenValido(recebido: string | null): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Asaas payment events. Configure the same token in Asaas → Integrações → Webhooks. */
export async function POST(req: Request) {
  if (!tokenValido(req.headers.get("asaas-access-token"))) return new Response("não autorizado", { status: 401 });
  const ev = (await req.json()) as { event?: string; payment?: { id: string; externalReference?: string } };
  if (!ev.payment) return Response.json({ ok: true });
  const faturaId = ev.payment.externalReference;
  if (ev.event === "PAYMENT_RECEIVED" || ev.event === "PAYMENT_CONFIRMED") {
    if (faturaId) await registrarPagamento(faturaId);
  } else if (ev.event === "PAYMENT_OVERDUE" && faturaId) {
    await getDb().update(schema.faturas).set({ status: "vencida" }).where(eq(schema.faturas.id, faturaId));
  }
  return Response.json({ ok: true });
}
