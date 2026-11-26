import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { cifrar, decifrar } from "@/server/cripto";
import type { AgentConfig } from "@/lib/agent/config";
import { motor as motorDe, type IdMotor } from "@/lib/agent/motores";
import { AnthropicLlm, getLlm, type EstruturadoReq, type Llm, type TurnoReq } from "./llm";
import { estruturadoOpenAI, turnoOpenAI } from "./llm-openai";

/**
 * The customer's own AI engine (their API key) — used for the calls of an agent whose config picks
 * a provider other than RecepIA. If the provider fails mid-call (key revoked, quota, outage), the
 * turn falls back to RecepIA so the caller never hears silence.
 */
const tipo = (id: IdMotor) => `motor_${id}`;

export async function salvarChaveMotor(orgId: string, id: IdMotor, chave: string) {
  const db = getDb();
  const [atual] = await db.select({ id: schema.integracoes.id }).from(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, tipo(id))));
  const dados = { status: "conectado" as const, credenciais: cifrar(JSON.stringify({ chave })), detalhes: { final: chave.slice(-4) }, atualizadoEm: new Date() };
  if (atual) await db.update(schema.integracoes).set(dados).where(eq(schema.integracoes.id, atual.id));
  else await db.insert(schema.integracoes).values({ orgId, tipo: tipo(id), ...dados });
}

export async function removerChaveMotor(orgId: string, id: IdMotor) {
  await getDb().delete(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, tipo(id))));
}

/** Which providers have a saved key (last 4 chars only — the key itself never leaves the server). */
export async function chavesMotor(orgId: string): Promise<Partial<Record<IdMotor, string>>> {
  const linhas = await getDb().select({ tipo: schema.integracoes.tipo, detalhes: schema.integracoes.detalhes }).from(schema.integracoes).where(eq(schema.integracoes.orgId, orgId));
  return Object.fromEntries(linhas.filter((l) => l.tipo.startsWith("motor_")).map((l) => [l.tipo.slice(6), (l.detalhes as { final?: string } | null)?.final ?? ""]));
}

async function chaveDe(orgId: string, id: IdMotor): Promise<string | null> {
  const [l] = await getDb().select({ c: schema.integracoes.credenciais }).from(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, tipo(id))));
  if (!l?.c) return null;
  try {
    return (JSON.parse(decifrar(l.c)) as { chave: string }).chave;
  } catch {
    return null;
  }
}

/** An engine for one provider + model + key. */
export function criarMotor(id: IdMotor, modelo: string, chave: string): Llm {
  const m = motorDe(id);
  const nomeModelo = modelo || m.modelos[0] || "";
  if (id === "anthropic") {
    const base = new AnthropicLlm(chave);
    return {
      real: true,
      gratuito: true, // billed by the provider to the customer: no LLM cost on our ledger
      turno: (req: TurnoReq) => base.turno({ ...req, modelo: nomeModelo as TurnoReq["modelo"] }),
      estruturado: <T,>(req: EstruturadoReq<T>) => base.estruturado({ ...req, modelo: nomeModelo as TurnoReq["modelo"] }),
    };
  }
  const e = { nome: id, baseURL: (m as { baseURL?: string }).baseURL ?? "", modelo: nomeModelo, chave, timeoutMs: 20_000 };
  return {
    real: true,
    gratuito: true,
    turno: (req: TurnoReq) => turnoOpenAI(e, req),
    estruturado: <T,>(req: EstruturadoReq<T>) => estruturadoOpenAI(e, req),
  };
}

/** Customer engine with automatic fallback to RecepIA. */
function comReserva(principal: Llm, reserva: Llm): Llm {
  return {
    real: true,
    gratuito: true,
    turno: async (req) => {
      try {
        return await principal.turno(req);
      } catch (e) {
        console.warn("[motor] provedor do cliente falhou, usando RecepIA:", e instanceof Error ? e.message.slice(0, 160) : e);
        return reserva.turno(req);
      }
    },
    estruturado: async (req) => {
      try {
        return await principal.estruturado(req);
      } catch {
        return reserva.estruturado(req);
      }
    },
  };
}

/** The engine for an agent's calls: RecepIA unless the agent picked another provider with a saved key. */
export async function getLlmDoAgente(orgId: string, config: Pick<AgentConfig, "motor">): Promise<Llm> {
  const recepia = await getLlm();
  const id = config.motor?.provedor ?? "recepia";
  if (id === "recepia") return recepia;
  const chave = await chaveDe(orgId, id);
  if (!chave) return recepia;
  return comReserva(criarMotor(id, config.motor.modelo, chave), recepia);
}

/** One tiny request to check a key + model before saving. */
export async function testarMotor(id: IdMotor, modelo: string, chave: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const r = await criarMotor(id, modelo, chave).turno({
      modelo: "claude-haiku-5-5",
      system: "Responda apenas: ok",
      messages: [{ role: "user", content: "teste" }],
      tools: [],
      maxTokens: 20,
    });
    return r.content.length ? { ok: true } : { ok: false, erro: "O provedor respondeu vazio." };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { ok: false, erro: /401|403|invalid|unauthor/i.test(m) ? "Chave recusada pelo provedor." : /404|model/i.test(m) ? "Modelo não encontrado nesse provedor." : `O provedor não respondeu (${m.slice(0, 120)}).` };
  }
}
