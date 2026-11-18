"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";
import { primeiroAgente } from "@/server/agent/agentes";
import { apontarNumero, buscarDisponiveis, comprarNumero, contaTwilio, liberarNumero, numerosDaConta, registrarNumero, urlVoz, type Disponivel } from "@/server/telefonia/twilio";

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

/* ───────── Twilio numbers (platform account or the customer's own) ───────── */


export type RBusca = { erro?: string; numeros?: Disponivel[] } | undefined;

const msg = (e: unknown) => (e instanceof Error ? e.message : "Erro na Twilio");

export async function buscarNumeros(_: RBusca, fd: FormData): Promise<RBusca> {
  const s = await exigirPermissao("editarAgente");
  const conta = await contaTwilio(s.org.id);
  if (!conta) return { erro: "Conecte a Twilio em Integrações para comprar números." };
  try {
    const numeros = await buscarDisponiveis(conta, { pais: String(fd.get("pais") ?? "US"), ddd: String(fd.get("ddd") ?? "") });
    return numeros.length ? { numeros } : { erro: "Nenhum número disponível com esse filtro. Tente outro DDD." };
  } catch (e) {
    return { erro: msg(e) };
  }
}

export async function comprarNumeroTwilio(numero: string): Promise<R> {
  const s = await exigirPermissao("editarAgente");
  const conta = await contaTwilio(s.org.id);
  if (!conta) return { erro: "Conecte a Twilio em Integrações." };
  try {
    const n = await comprarNumero(conta, numero);
    const agente = await primeiroAgente(s.org.id);
    await registrarNumero(s.org.id, agente?.id ?? null, n, Boolean(n.voiceUrl));
    revalidatePath("/painel/numeros");
    return { ok: true, mensagem: n.voiceUrl ? `${n.formatado} é seu e já atende com a recepcionista.` : `${n.formatado} é seu. Defina a URL pública e clique em "Apontar" para ele atender.` };
  } catch (e) {
    return { erro: msg(e) };
  }
}

export async function usarNumeroDaConta(sid: string): Promise<R> {
  const s = await exigirPermissao("editarAgente");
  const conta = await contaTwilio(s.org.id);
  if (!conta) return { erro: "Conecte a Twilio em Integrações." };
  try {
    const n = (await numerosDaConta(conta)).find((x) => x.sid === sid);
    if (!n) return { erro: "Número não encontrado na conta Twilio." };
    let apontado = false;
    if (urlVoz()) {
      await apontarNumero(conta, sid);
      apontado = true;
    }
    const agente = await primeiroAgente(s.org.id);
    await registrarNumero(s.org.id, agente?.id ?? null, n, apontado);
    revalidatePath("/painel/numeros");
    return { ok: true, mensagem: apontado ? `${n.formatado} agora atende com a recepcionista.` : `${n.formatado} foi adicionado. Falta a URL pública para apontar.` };
  } catch (e) {
    return { erro: msg(e) };
  }
}

export async function apontarNumeroTwilio(id: string): Promise<R> {
  const s = await exigirPermissao("editarAgente");
  const conta = await contaTwilio(s.org.id);
  const [n] = await getDb().select().from(schema.numeros).where(and(eq(schema.numeros.orgId, s.org.id), eq(schema.numeros.id, id)));
  if (!conta || !n?.provedorSid) return { erro: "Número ou conta Twilio não encontrados." };
  try {
    await apontarNumero(conta, n.provedorSid);
    await getDb().update(schema.numeros).set({ verificadoEm: new Date() }).where(eq(schema.numeros.id, id));
    revalidatePath("/painel/numeros");
    return { ok: true, mensagem: "Apontado: as ligações para este número caem na recepcionista." };
  } catch (e) {
    return { erro: msg(e) };
  }
}

export async function liberarNumeroTwilio(id: string): Promise<R> {
  const s = await exigirPermissao("editarAgente");
  const conta = await contaTwilio(s.org.id);
  const [n] = await getDb().select().from(schema.numeros).where(and(eq(schema.numeros.orgId, s.org.id), eq(schema.numeros.id, id)));
  if (!n) return { erro: "Número não encontrado." };
  try {
    // numbers on the customer's own account are only detached; platform numbers are released
    if (conta?.origem === "plataforma" && n.provedorSid) await liberarNumero(conta, n.provedorSid);
    await getDb().delete(schema.numeros).where(eq(schema.numeros.id, id));
    revalidatePath("/painel/numeros");
    return { ok: true, mensagem: conta?.origem === "plataforma" ? "Número liberado." : "Número removido da recepcionista (continua na sua conta Twilio)." };
  } catch (e) {
    return { erro: msg(e) };
  }
}
