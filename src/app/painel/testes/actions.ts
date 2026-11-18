"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Severidade } from "@/db/schema";
import { exigirPermissao } from "@/server/auth/session";
import { obterAgente } from "@/server/agent/agentes";
import { executarCaso, executarSuite, LimiteSimulacoes } from "@/server/testes/suite";

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
  try {
    const r = await executarSuite(s.org.id, agenteId, { rodadas: [1, 3, 5, 15].includes(rodadas) ? rodadas : 1 });
    const ok = r.filter((x) => x.execucao.aprovadas === x.execucao.rodadas).length;
    revalidatePath("/painel/testes");
    return { ok: true, mensagem: `${ok}/${r.length} testes aprovados` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Erro" };
  }
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
