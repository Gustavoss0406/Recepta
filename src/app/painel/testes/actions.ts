"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Severidade } from "@/db/schema";
import { exigirPermissao } from "@/server/auth/session";
import { obterAgente } from "@/server/agent/agentes";
import { executarCaso, LimiteSimulacoes } from "@/server/testes/suite";

export type R = { ok?: boolean; erro?: string; mensagem?: string } | undefined;

export async function rodarCaso(casoId: string, rodadas: number): Promise<R> {
  const s = await exigirPermissao("editarAgente");
  try {
    const ex = await executarCaso(s.org.id, casoId, Math.min(Math.max(rodadas, 1), 15));
    revalidatePath("/painel/testes");
    return { ok: true, mensagem: `${ex.aprovadas}/${ex.rodadas} aprovadas` };
  } catch (e) {
    return { erro: e instanceof LimiteSimulacoes ? e.message : e instanceof Error ? e.message : "Erro" };
  }
}

export async function rodarSuite(agenteId: string, rodadas = 1): Promise<R> {
  const s = await exigirPermissao("editarAgente");
  await obterAgente(s.org.id, agenteId);
  // The whole suite can take minutes on free engines (they are paced): it runs in the worker and the
  // page refreshes itself while executions are "rodando".
  const n = [1, 3, 5, 15].includes(rodadas) ? rodadas : 1;
  await getDb().insert(schema.jobs).values({ tipo: "testes.suite", payload: { orgId: s.org.id, agenteId, rodadas: n } });
  revalidatePath("/painel/testes");
  return { ok: true, mensagem: "Rodando em segundo plano. Os resultados aparecem aqui conforme cada teste termina." };
}

export async function criarCaso(agenteId: string, _: R, fd: FormData): Promise<R> {
  const s = await exigirPermissao("editarAgente");
  await obterAgente(s.org.id, agenteId);
  const tipo = String(fd.get("tipo")) as "simulacao" | "proxima_resposta" | "chamada_acao";
  const nome = String(fd.get("nome") ?? "").trim();
  const severidade = String(fd.get("severidade") ?? "importante") as Severidade;
  if (!nome) return { erro: "Dê um nome ao teste." };
  const historico = String(fd.get("historico") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.toLowerCase().startsWith("agente:") ? { papel: "agente" as const, texto: l.slice(7).trim() } : { papel: "cliente" as const, texto: l.replace(/^cliente:\s*/i, "") }));
  let config: Record<string, unknown>;
  if (tipo === "simulacao")
    config = {
      persona: String(fd.get("persona") ?? "Cliente comum."),
      objetivo: String(fd.get("objetivo") ?? ""),
      criterio: String(fd.get("criterio") ?? ""),
      maxTurnos: Number(fd.get("maxTurnos") ?? 10),
      mockAgenda: String(fd.get("mockAgenda") ?? "com_horarios"),
    };
  else if (tipo === "proxima_resposta") config = { historico, mensagem: String(fd.get("mensagem") ?? ""), criterio: String(fd.get("criterio") ?? "") };
  else {
    const parametros = Object.fromEntries(
      String(fd.get("parametros") ?? "")
        .split(",")
        .map((p) => p.split("=").map((x) => x.trim()))
        .filter(([k, v]) => k && v),
    );
    config = { historico, mensagem: String(fd.get("mensagem") ?? ""), ferramenta: String(fd.get("ferramenta") ?? ""), parametros };
  }
  await getDb().insert(schema.casosTeste).values({ orgId: s.org.id, agenteId, tipo, nome, severidade, config });
  revalidatePath("/painel/testes");
  return { ok: true, mensagem: "Teste criado" };
}

export async function excluirCaso(casoId: string) {
  const s = await exigirPermissao("editarAgente");
  await getDb().delete(schema.casosTeste).where(and(eq(schema.casosTeste.orgId, s.org.id), eq(schema.casosTeste.id, casoId)));
  revalidatePath("/painel/testes");
}

export async function mudarSeveridade(casoId: string, severidade: Severidade) {
  const s = await exigirPermissao("editarAgente");
  await getDb()
    .update(schema.casosTeste)
    .set({ severidade })
    .where(and(eq(schema.casosTeste.orgId, s.org.id), eq(schema.casosTeste.id, casoId)));
  revalidatePath("/painel/testes");
}

/** Transcript of one simulated run (shown inline under the test, approved or not). */
export async function transcricaoTeste(conversaId: string): Promise<{ papel: string; texto: string }[]> {
  const s = await exigirPermissao("editarAgente");
  const [c] = await getDb()
    .select({ id: schema.conversas.id })
    .from(schema.conversas)
    .where(and(eq(schema.conversas.orgId, s.org.id), eq(schema.conversas.id, conversaId), eq(schema.conversas.teste, true)));
  if (!c) return [];
  const [turnos, acoes] = await Promise.all([
    getDb().select({ papel: schema.turnos.papel, texto: schema.turnos.texto, ordem: schema.turnos.ordem }).from(schema.turnos).where(eq(schema.turnos.conversaId, conversaId)).orderBy(schema.turnos.ordem),
    getDb().select({ nome: schema.chamadasFerramenta.nome, criadoEm: schema.chamadasFerramenta.criadoEm }).from(schema.chamadasFerramenta).where(eq(schema.chamadasFerramenta.conversaId, conversaId)),
  ]);
  return [...turnos.map((t) => ({ papel: t.papel, texto: t.texto })), ...(acoes.length ? [{ papel: "acoes", texto: acoes.map((a) => a.nome).join(", ") }] : [])];
}
