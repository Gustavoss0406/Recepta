import "server-only";
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export const EVENTOS = ["call.ended", "call.transferred", "handoff.created", "test.failed"] as const;
export type Evento = (typeof EVENTOS)[number];

export function assinar(segredo: string, corpo: string, timestamp: number): string {
  return createHmac("sha256", segredo).update(`${timestamp}.${corpo}`).digest("hex");
}

/** Records one delivery per subscribed webhook and queues it; the worker sends with retries. */
export async function emitirEvento(orgId: string, evento: Evento, payload: Record<string, unknown>) {
  const db = getDb();
  const hooks = await db.select().from(schema.webhooks).where(and(eq(schema.webhooks.orgId, orgId), eq(schema.webhooks.ativo, true)));
  for (const h of hooks.filter((h) => h.eventos.includes(evento))) {
    const [e] = await db
      .insert(schema.entregasWebhook)
      .values({ orgId, webhookId: h.id, evento, payload: { evento, criadoEm: new Date().toISOString(), dados: payload } })
      .returning();
    await db.insert(schema.jobs).values({ tipo: "webhook.entregar", payload: { entregaId: e.id } });
  }
}
