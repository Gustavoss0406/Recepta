"use server";

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirSessao } from "@/server/auth/session";
import { obterAgente } from "@/server/agent/agentes";
import { encerrarConversa, iniciarConversa, responder } from "@/server/agent/runtime";

async function conversaDaOrg(orgId: string, conversaId: string) {
  const [c] = await getDb()
    .select({ id: schema.conversas.id })
    .from(schema.conversas)
    .where(and(eq(schema.conversas.orgId, orgId), eq(schema.conversas.id, conversaId)));
  if (!c) throw new Error("Conversa não encontrada");
}

export async function testeIniciar(agenteId: string, canal: "teste_texto" | "teste_voz" | "simulador" = "teste_texto") {
  const s = await exigirSessao();
  await obterAgente(s.org.id, agenteId);
  return iniciarConversa({ orgId: s.org.id, agenteId, canal, de: canal === "simulador" ? "+55 11 90000-0000" : undefined });
}

export async function testeResponder(conversaId: string, texto: string) {
  const s = await exigirSessao();
  await conversaDaOrg(s.org.id, conversaId);
  const t = texto.trim().slice(0, 1000);
  if (!t) throw new Error("Mensagem vazia");
  return responder(conversaId, t);
}

export async function testeEncerrar(conversaId: string) {
  const s = await exigirSessao();
  await conversaDaOrg(s.org.id, conversaId);
  const c = await encerrarConversa(conversaId);
  return {
    resultado: c.resultado,
    resumo: c.resumo,
    dados: c.dados,
    avaliacao: c.avaliacao,
    sentimento: c.sentimento,
    duracaoS: c.duracaoS,
    minutosCobrados: c.minutosCobrados,
  };
}
