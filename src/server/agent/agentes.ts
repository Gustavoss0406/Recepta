import "server-only";
import { and, desc, eq, max } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Papel } from "@/db/schema";
import { agentConfigSchema, type AgentConfig, type Nicho } from "@/lib/agent/config";
import { compilarPrompt } from "@/lib/agent/prompt";
import { getNicho } from "@/lib/niches";
import { workflowCompleto } from "@/lib/agent/workflow-completo";

export class ErroAgente extends Error {}

export async function criarAgente(orgId: string, nicho: Nicho, empresa: { nome: string; cidade?: string }, opts: { fluxoCompleto?: boolean } = {}) {
  const base = getNicho(nicho).padrao(empresa);
  // new receptionists start with the full service flow (questions, booking, complaints, after hours…)
  const config = opts.fluxoCompleto === false ? base : { ...base, workflow: workflowCompleto(base) };
  const [a] = await getDb()
    .insert(schema.agentes)
    .values({ orgId, nome: `Recepção ${empresa.nome}`, nicho, rascunho: config })
    .returning();
  return a;
}

/** Fills fields added after a config was saved (e.g. workflow, widget.ativo) with their schema defaults. */
export function normalizarConfig(c: AgentConfig): AgentConfig {
  const r = agentConfigSchema.safeParse(c);
  return r.success ? r.data : c;
}

export async function listarAgentes(orgId: string) {
  const lista = await getDb().select().from(schema.agentes).where(eq(schema.agentes.orgId, orgId)).orderBy(schema.agentes.criadoEm);
  return lista.map((a) => ({ ...a, rascunho: normalizarConfig(a.rascunho) }));
}

export async function obterAgente(orgId: string, agenteId: string) {
  const [a] = await getDb()
    .select()
    .from(schema.agentes)
    .where(and(eq(schema.agentes.orgId, orgId), eq(schema.agentes.id, agenteId)))
    .limit(1);
  if (!a) throw new ErroAgente("Agente não encontrado");
  return { ...a, rascunho: normalizarConfig(a.rascunho) };
}

export async function primeiroAgente(orgId: string) {
  const [a] = await getDb().select().from(schema.agentes).where(eq(schema.agentes.orgId, orgId)).orderBy(schema.agentes.criadoEm).limit(1);
  return a ?? null;
}

type Patch = { [K in keyof AgentConfig]?: Partial<AgentConfig[K]> | AgentConfig[K] };

/** Merges section patches into the draft and validates the whole config. */
export async function salvarRascunho(orgId: string, agenteId: string, patch: Patch, nome?: string) {
  const a = await obterAgente(orgId, agenteId);
  const atual = a.rascunho;
  const novo = { ...atual } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    const base = (atual as Record<string, unknown>)[k];
    novo[k] = v && typeof v === "object" && !Array.isArray(v) && base && typeof base === "object" ? { ...base, ...v } : v;
  }
  const r = agentConfigSchema.safeParse(novo);
  if (!r.success) throw new ErroAgente(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  await getDb()
    .update(schema.agentes)
    .set({ rascunho: r.data, rascunhoAlteradoEm: new Date(), ...(nome ? { nome } : {}) })
    .where(and(eq(schema.agentes.orgId, orgId), eq(schema.agentes.id, agenteId)));
  return r.data;
}

export async function versoesDoAgente(orgId: string, agenteId: string) {
  return getDb()
    .select()
    .from(schema.agenteVersoes)
    .where(and(eq(schema.agenteVersoes.orgId, orgId), eq(schema.agenteVersoes.agenteId, agenteId)))
    .orderBy(desc(schema.agenteVersoes.numero));
}

export interface ResultadoGate {
  aprovado: boolean;
  falhasCriticas: { caso: string; aprovadas: number; rodadas: number }[];
  resumo: string;
}

/** Publishes the draft as a new immutable version. A failing critical gate blocks unless the owner forces it. */
export async function publicar(
  orgId: string,
  agenteId: string,
  autor: { id: string; papel: Papel },
  opts: { nota?: string; forcar?: boolean; gate?: ResultadoGate } = {},
) {
  const a = await obterAgente(orgId, agenteId);
  const prompt = compilarPrompt(a.rascunho);
  if (opts.gate && !opts.gate.aprovado) {
    if (!opts.forcar) throw new ErroAgente(`Publicação bloqueada: ${opts.gate.resumo}`);
    if (autor.papel !== "dono") throw new ErroAgente("Só o Dono pode publicar com testes críticos reprovados.");
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const [{ ultimo }] = await tx
      .select({ ultimo: max(schema.agenteVersoes.numero) })
      .from(schema.agenteVersoes)
      .where(eq(schema.agenteVersoes.agenteId, agenteId));
    const [v] = await tx
      .insert(schema.agenteVersoes)
      .values({
        orgId,
        agenteId,
        numero: (ultimo ?? 0) + 1,
        config: a.rascunho,
        prompt,
        nota: opts.nota ?? null,
        autorId: autor.id,
        forcada: Boolean(opts.gate && !opts.gate.aprovado),
        resultadoTestes: opts.gate ?? null,
      })
      .returning();
    await tx.update(schema.agentes).set({ status: "publicado", versaoPublicadaId: v.id }).where(eq(schema.agentes.id, agenteId));
    await tx.insert(schema.auditoria).values({
      orgId,
      usuarioId: autor.id,
      acao: v.forcada ? "agente.publicado_forcado" : "agente.publicado",
      detalhes: { agenteId, versao: v.numero },
    });
    return v;
  });
}

/** Restores an old version: it becomes the draft and is republished as a new version number. */
export async function restaurarVersao(orgId: string, agenteId: string, versaoId: string, autor: { id: string; papel: Papel }) {
  const [v] = await getDb()
    .select()
    .from(schema.agenteVersoes)
    .where(and(eq(schema.agenteVersoes.orgId, orgId), eq(schema.agenteVersoes.id, versaoId)))
    .limit(1);
  if (!v || v.agenteId !== agenteId) throw new ErroAgente("Versão não encontrada");
  await getDb()
    .update(schema.agentes)
    .set({ rascunho: v.config, rascunhoAlteradoEm: new Date() })
    .where(eq(schema.agentes.id, agenteId));
  return publicar(orgId, agenteId, autor, { nota: `Restaurada da versão ${v.numero}` });
}

/**
 * Config + prompt that a conversation should run: the published version, a specific version
 * (a call keeps the version it started on; A/B experiments pick one), or the draft for tests.
 */
export async function configParaConversa(orgId: string, agenteId: string, alvo: "publicado" | "rascunho" | { versaoId: string }) {
  const a = await obterAgente(orgId, agenteId);
  if (alvo !== "rascunho") {
    const versaoId = alvo === "publicado" ? a.versaoPublicadaId : alvo.versaoId;
    if (!versaoId) throw new ErroAgente("Este agente ainda não foi publicado.");
    const [v] = await getDb()
      .select()
      .from(schema.agenteVersoes)
      .where(and(eq(schema.agenteVersoes.id, versaoId), eq(schema.agenteVersoes.agenteId, agenteId)));
    if (!v) throw new ErroAgente("Versão não encontrada");
    return { agente: a, config: normalizarConfig(v.config), prompt: v.prompt, versaoId: v.id };
  }
  return { agente: a, config: a.rascunho, prompt: compilarPrompt(a.rascunho), versaoId: null };
}
