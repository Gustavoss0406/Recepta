import "server-only";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { FX_BRL_PER_USD } from "@/lib/pricing/rates";
import { llmCostUsd } from "@/lib/pricing/cogs";
import { getLlm, type UsoLlm } from "@/server/providers/llm";
import { encerrarConversa, iniciarConversa, responder } from "@/server/agent/runtime";
import { transcricaoTexto } from "@/server/agent/pos-chamada";

export interface ConfigSimulacao {
  persona: string;
  objetivo: string;
  criterio: string;
  maxTurnos: number;
  mockAgenda?: "com_horarios" | "sem_horarios";
}
export interface ConfigProximaResposta {
  historico: { papel: "cliente" | "agente"; texto: string }[];
  mensagem: string;
  criterio: string;
}
export interface ConfigChamadaAcao {
  historico: { papel: "cliente" | "agente"; texto: string }[];
  mensagem: string;
  ferramenta: string;
  parametros: Record<string, string>;
}

export interface Rodada {
  aprovado: boolean;
  justificativa: string;
  conversaId: string;
  demo: boolean;
}

const vereditoSchema = z.object({
  aprovado: z.boolean().describe("O critério foi cumprido?"),
  justificativa: z.string().describe("Uma frase citando o trecho decisivo"),
});

async function registrarCustoAuxiliar(orgId: string, conversaId: string, uso: UsoLlm, papel: string) {
  const usd = llmCostUsd("claude-haiku-5-5", { input: uso.input, cached: uso.cached, output: uso.output });
  if (usd <= 0) return;
  await getDb()
    .insert(schema.registroCusto)
    .values({ orgId, conversaId, tipo: "simulacao", detalhes: { papel, ...uso }, custoUsd: usd, custoBrl: usd * FX_BRL_PER_USD });
}

async function julgar(orgId: string, conversaId: string, criterio: string, transcricao: string): Promise<{ aprovado: boolean; justificativa: string; demo: boolean }> {
  const llm = await getLlm();
  if (!llm.real) return { aprovado: true, justificativa: "Não avaliado: modo demonstração. Configure ANTHROPIC_API_KEY.", demo: true };
  const { dados, uso } = await llm.estruturado({
    modelo: "claude-haiku-5-5",
    system:
      "Você é um avaliador rigoroso de agentes de atendimento por telefone. Julgue SOMENTE o critério dado, com base na transcrição. Em dúvida, reprove.",
    prompt: `Critério de sucesso: ${criterio}\n\nTranscrição:\n${transcricao}`,
    schema: vereditoSchema,
    maxTokens: 400,
  });
  await registrarCustoAuxiliar(orgId, conversaId, uso, "juiz");
  return { ...dados, demo: false };
}

/** The customer side of a simulation: an LLM role-playing the persona and goal. */
async function falaDoCliente(orgId: string, conversaId: string, cfg: ConfigSimulacao, transcricao: string, turno: number): Promise<string | null> {
  const llm = await getLlm();
  if (!llm.real) {
    // Demo script: state the goal, accept the first offer, say goodbye.
    return [cfg.objetivo, "Pode ser o primeiro horário, sim.", "Obrigado, tchau!"][turno] ?? null;
  }
  const { dados, uso } = await llm.estruturado({
    modelo: "claude-haiku-5-5",
    system: `Você interpreta um CLIENTE ligando para uma empresa, em português do Brasil, falando como ao telefone (frases curtas).
Persona: ${cfg.persona}
Objetivo: ${cfg.objetivo}
Fale só a próxima fala do cliente. Se o objetivo foi atingido ou a conversa acabou, marque terminou=true.`,
    prompt: `Conversa até agora:\n${transcricao}\n\nQual a próxima fala do cliente?`,
    schema: z.object({ fala: z.string(), terminou: z.boolean() }),
    maxTokens: 200,
  });
  await registrarCustoAuxiliar(orgId, conversaId, uso, "cliente");
  return dados.terminou ? null : dados.fala;
}

async function transcricao(conversaId: string) {
  const t = await getDb()
    .select({ papel: schema.turnos.papel, texto: schema.turnos.texto })
    .from(schema.turnos)
    .where(eq(schema.turnos.conversaId, conversaId))
    .orderBy(asc(schema.turnos.ordem));
  return transcricaoTexto(t);
}

export async function rodarSimulacao(orgId: string, agenteId: string, cfg: ConfigSimulacao): Promise<Rodada> {
  const ini = await iniciarConversa({ orgId, agenteId, canal: "simulacao", mockAgenda: cfg.mockAgenda ?? "com_horarios" });
  for (let i = 0; i < cfg.maxTurnos; i++) {
    const fala = await falaDoCliente(orgId, ini.conversaId, cfg, await transcricao(ini.conversaId), i);
    if (!fala) break;
    const r = await responder(ini.conversaId, fala);
    if (r.encerrar) break;
  }
  await encerrarConversa(ini.conversaId);
  const v = await julgar(orgId, ini.conversaId, cfg.criterio, await transcricao(ini.conversaId));
  return { ...v, conversaId: ini.conversaId };
}

/** Seeds a conversation with a scripted history, then lets the agent answer one message. */
async function umTurno(orgId: string, agenteId: string, historico: ConfigProximaResposta["historico"], mensagem: string) {
  const ini = await iniciarConversa({ orgId, agenteId, canal: "simulacao", mockAgenda: "com_horarios" });
  const db = getDb();
  const msgs = historico.map((h) => ({ role: h.papel === "cliente" ? "user" : "assistant", content: h.papel === "cliente" ? `Cliente: ${h.texto}` : h.texto }));
  if (msgs.length && msgs[0].role === "assistant") msgs.unshift({ role: "user", content: "Cliente: (ligação iniciada)" });
  const [c] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, ini.conversaId));
  await db.update(schema.conversas).set({ estado: { ...c.estado!, mensagens: msgs } }).where(eq(schema.conversas.id, ini.conversaId));
  for (const [i, h] of historico.entries())
    await db.insert(schema.turnos).values({ orgId, conversaId: ini.conversaId, ordem: i + 1, papel: h.papel, texto: h.texto });
  const r = await responder(ini.conversaId, mensagem);
  await encerrarConversa(ini.conversaId);
  return { ini, r };
}

export async function rodarProximaResposta(orgId: string, agenteId: string, cfg: ConfigProximaResposta): Promise<Rodada> {
  const { ini, r } = await umTurno(orgId, agenteId, cfg.historico, cfg.mensagem);
  const v = await julgar(orgId, ini.conversaId, cfg.criterio, `${transcricaoTexto(cfg.historico)}\nCliente: ${cfg.mensagem}\nAgente: ${r.falas.join(" ")}`);
  return { ...v, conversaId: ini.conversaId };
}

export async function rodarChamadaAcao(orgId: string, agenteId: string, cfg: ConfigChamadaAcao): Promise<Rodada> {
  const { ini, r } = await umTurno(orgId, agenteId, cfg.historico, cfg.mensagem);
  const chamada = r.acoes.find((a) => a.nome === cfg.ferramenta);
  if (!chamada) return { aprovado: false, justificativa: `O agente não chamou ${cfg.ferramenta} (chamou: ${r.acoes.map((a) => a.nome).join(", ") || "nada"}).`, conversaId: ini.conversaId, demo: false };
  const faltando = Object.entries(cfg.parametros).filter(
    ([k, v]) => !String(chamada.args[k] ?? "").toLowerCase().includes(v.toLowerCase()),
  );
  return {
    aprovado: faltando.length === 0,
    justificativa: faltando.length ? `Parâmetros diferentes do esperado: ${faltando.map(([k]) => k).join(", ")}` : `Chamou ${cfg.ferramenta} com os parâmetros esperados.`,
    conversaId: ini.conversaId,
    demo: false,
  };
}
