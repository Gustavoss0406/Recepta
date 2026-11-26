"use server";

import { exigirPermissao } from "@/server/auth/session";
import { finalizar, iniciar, pularPergunta, responder, type EstadoOnboarding } from "@/lib/onboarding/conversa";
import { carregarOnboarding, concluirOnboarding, interpretar, salvarOnboarding } from "@/server/onboarding/conversa";

type Res = { estado: EstadoOnboarding; agenteId?: string; erro?: string };

async function fim(orgId: string, e: EstadoOnboarding): Promise<Res> {
  await salvarOnboarding(orgId, e);
  if (!e.concluido) return { estado: e };
  // no revalidation here: it would swap the conversation for the wizard before the owner sees the result
  const agenteId = await concluirOnboarding(orgId, e);
  return { estado: e, agenteId };
}

export async function onboardingMensagem(texto: string): Promise<Res> {
  const s = await exigirPermissao("editarAgente");
  let e = await carregarOnboarding(s.org.id);
  if (e.concluido) e = iniciar(); // redoing the conversation for an existing receptionist
  const t = texto.trim();
  if (!t) return { estado: e };
  const ia = e.perguntaAtual ? await interpretar(e.perfil, e.perguntaAtual, t) : null;
  return fim(s.org.id, responder(e, t, ia ?? {}));
}

export async function onboardingPular(): Promise<Res> {
  const s = await exigirPermissao("editarAgente");
  return fim(s.org.id, pularPergunta(await carregarOnboarding(s.org.id)));
}

export async function onboardingFinalizar(): Promise<Res> {
  const s = await exigirPermissao("editarAgente");
  return fim(s.org.id, finalizar(await carregarOnboarding(s.org.id)));
}

export async function onboardingRecomecar(): Promise<Res> {
  const s = await exigirPermissao("editarAgente");
  const e = iniciar();
  await salvarOnboarding(s.org.id, e);
  return { estado: e };
}

/** Site/Instagram fields: analyses the company right now and lets it drive the next questions and the flow. */
export async function onboardingAnalisar(site: string, instagram: string): Promise<Res> {
  const s = await exigirPermissao("editarAgente");
  let e = await carregarOnboarding(s.org.id);
  if (e.concluido) e = iniciar();
  const { analisarEmpresa } = await import("@/server/onboarding/analise");
  const { aplicarAnalise } = await import("@/lib/onboarding/conversa");
  const r = await analisarEmpresa(e.perfil, { site: site.slice(0, 300), instagram: instagram.slice(0, 200) });
  return fim(s.org.id, aplicarAnalise(e, r));
}

/** Integrations already connected (the onboarding re-checks when the owner comes back from an OAuth tab). */
export async function onboardingConexoes(): Promise<string[]> {
  const s = await exigirPermissao("editarAgente");
  const { getDb, schema } = await import("@/db/client");
  const { and, eq } = await import("drizzle-orm");
  const linhas = await getDb()
    .select({ tipo: schema.integracoes.tipo })
    .from(schema.integracoes)
    .where(and(eq(schema.integracoes.orgId, s.org.id), eq(schema.integracoes.status, "conectado")));
  return linhas.map((l) => (l.tipo === "google_agenda" ? "google" : l.tipo));
}
