"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";
import { primeiroAgente } from "@/server/agent/agentes";

export type R = { ok?: boolean; erro?: string; mensagem?: string } | undefined;

/** Number that receives forwarded calls. Without a telephony account it is a sandbox number. */
function numeroRecepta(orgId: string) {
  const sufixo = parseInt(orgId.replace(/\D/g, "").slice(0, 4) || "1000", 10) % 10000;
  return `+55 11 4000-${String(sufixo).padStart(4, "0")}`;
}

export async function salvarDesvio(_: R, fd: FormData): Promise<R> {
  const s = await exigirPermissao("editarAgente");
  const desvioDe = String(fd.get("desvioDe") ?? "").trim();
  if (desvioDe.replace(/\D/g, "").length < 10) return { erro: "Informe o número atual com DDD." };
  const agente = await primeiroAgente(s.org.id);
  const db = getDb();
  const [existe] = await db
    .select()
    .from(schema.numeros)
    .where(and(eq(schema.numeros.orgId, s.org.id), eq(schema.numeros.tipo, "desvio")))
    .limit(1);
  const valores = {
    desvioDe,
    operadora: String(fd.get("operadora") ?? ""),
    modoDesvio: String(fd.get("modo") ?? "nao_atende_ocupado"),
    agenteId: agente?.id ?? null,
  };
  if (existe) await db.update(schema.numeros).set({ ...valores, verificadoEm: null }).where(eq(schema.numeros.id, existe.id));
  else
    await db.insert(schema.numeros).values({
      orgId: s.org.id,
      e164: numeroRecepta(s.org.id),
      tipo: process.env.TWILIO_ACCOUNT_SID ? "desvio" : "desvio",
      ...valores,
    });
  revalidatePath("/painel/numeros");
  revalidatePath("/painel/comecar");
  return { ok: true, mensagem: "Desvio salvo. Agora ative na sua operadora e verifique." };
}

/**
 * Verification. With a telephony account, the inbound webhook marks the number as verified when the
 * test call arrives. Without one (sandbox), we record a simulated verification, labelled as such.
 */
export async function verificarDesvio(): Promise<R> {
  const s = await exigirPermissao("editarAgente");
  const db = getDb();
  const [n] = await db
    .select()
    .from(schema.numeros)
    .where(and(eq(schema.numeros.orgId, s.org.id), eq(schema.numeros.tipo, "desvio")))
    .limit(1);
  if (!n) return { erro: "Salve o desvio primeiro." };
  if (process.env.TWILIO_ACCOUNT_SID)
    return { ok: true, mensagem: `Ligue agora para ${n.desvioDe}. Quando a ligação chegar à Recepta, o desvio fica verificado.` };
  await db.update(schema.numeros).set({ verificadoEm: new Date() }).where(eq(schema.numeros.id, n.id));
  revalidatePath("/painel/numeros");
  revalidatePath("/painel/comecar");
  return { ok: true, mensagem: "Verificação simulada concluída (ambiente sem telefonia configurada)." };
}
