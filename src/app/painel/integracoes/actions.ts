"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";
import { novoToken } from "@/server/auth/tokens";
import { urlPublicaSegura } from "@/server/crawler/seguranca";
import { EVENTOS } from "@/server/integracoes/eventos";
import { entregarWebhook } from "@/server/jobs/tarefas";
import { conectar, desconectar, testarConexao } from "@/server/integracoes/servico";
import { desconectarGoogle } from "@/server/integracoes/google";

export type R = { ok?: boolean; erro?: string; mensagem?: string } | undefined;

export async function criarWebhook(_: R, fd: FormData): Promise<R> {
  const s = await exigirPermissao("integracoes");
  const url = String(fd.get("url") ?? "").trim();
  try {
    await urlPublicaSegura(url);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "URL inválida" };
  }
  const eventos = fd.getAll("eventos").map(String).filter((e) => (EVENTOS as readonly string[]).includes(e));
  if (!eventos.length) return { erro: "Escolha ao menos um evento." };
  const segredo = `whsec_${novoToken(24)}`;
  await getDb().insert(schema.webhooks).values({ orgId: s.org.id, url, eventos, segredo });
  revalidatePath("/painel/integracoes");
  return { ok: true, mensagem: `Webhook criado. Segredo (guarde agora): ${segredo}` };
}

export async function excluirWebhook(id: string) {
  const s = await exigirPermissao("integracoes");
  await getDb().delete(schema.webhooks).where(and(eq(schema.webhooks.orgId, s.org.id), eq(schema.webhooks.id, id)));
  revalidatePath("/painel/integracoes");
}

export async function testarWebhook(id: string) {
  const s = await exigirPermissao("integracoes");
  const db = getDb();
  const [h] = await db.select().from(schema.webhooks).where(and(eq(schema.webhooks.orgId, s.org.id), eq(schema.webhooks.id, id)));
  if (!h) return;
  const [e] = await db
    .insert(schema.entregasWebhook)
    .values({ orgId: s.org.id, webhookId: id, evento: "call.ended", payload: { evento: "call.ended", teste: true, criadoEm: new Date().toISOString(), dados: { conversaId: "teste", resultado: "resolvido", resumo: "Evento de teste da Recepta" } } })
    .returning();
  await entregarWebhook(e.id);
  revalidatePath("/painel/integracoes");
}

export async function acaoConectarIntegracao(id: string, _: R, fd: FormData): Promise<R> {
  const s = await exigirPermissao("integracoes");
  const campos = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  try {
    const conta = await conectar(s.org.id, id, campos);
    revalidatePath("/painel/integracoes");
    return { ok: true, mensagem: `Conectado: ${conta}` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível conectar" };
  }
}

export async function acaoTestarIntegracao(id: string): Promise<R> {
  const s = await exigirPermissao("integracoes");
  try {
    const conta = await testarConexao(s.org.id, id);
    revalidatePath("/painel/integracoes");
    return { ok: true, mensagem: `Funcionando: ${conta}` };
  } catch (e) {
    revalidatePath("/painel/integracoes");
    return { erro: e instanceof Error ? e.message : "Falhou" };
  }
}

export async function acaoDesconectarIntegracao(id: string) {
  const s = await exigirPermissao("integracoes");
  if (id === "google") await desconectarGoogle(s.org.id);
  else await desconectar(s.org.id, id);
  revalidatePath("/painel/integracoes");
}
