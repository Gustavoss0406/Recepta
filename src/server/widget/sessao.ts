import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { configParaConversa } from "@/server/agent/agentes";
import { assinarTokenVoz } from "@/server/voice/token";

/**
 * Public website widget: who may open a voice session for an agent.
 * Rate limits are per process (sliding window); concurrency and billing are enforced again
 * by the runtime (admitirChamada) when the gateway starts the call.
 */
const JANELA_MS = 10 * 60_000;
const POR_VISITANTE = 6; // sessions per visitor IP per agent per 10 min
const POR_AGENTE = 60; // sessions per agent per 10 min (abuse ceiling)
const registros = new Map<string, number[]>();

export function permitir(chave: string, limite: number, agora = Date.now()): boolean {
  const lista = (registros.get(chave) ?? []).filter((t) => agora - t < JANELA_MS);
  if (lista.length >= limite) {
    registros.set(chave, lista);
    return false;
  }
  lista.push(agora);
  registros.set(chave, lista);
  return true;
}

export function _limparLimites() {
  registros.clear();
}

/** Hostname allowlist: exact host or any subdomain of an allowed entry. Empty list = any site. */
export function dominioPermitido(host: string | null, dominios: string[]): boolean {
  if (!dominios.length) return true;
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, "");
  return dominios.some((d) => {
    const x = d.toLowerCase().replace(/^www\./, "");
    return h === x || h.endsWith(`.${x}`);
  });
}

export type ResultadoSessao =
  | { ok: true; token: string; agente: { nome: string; cor: string; texto: string } }
  | { ok: false; status: number; erro: string };

export async function abrirSessaoWidget(agenteId: string, opts: { ip: string; host: string | null; agora?: number }): Promise<ResultadoSessao> {
  const [a] = await getDb().select().from(schema.agentes).where(eq(schema.agentes.id, agenteId));
  if (!a || !a.versaoPublicadaId || a.status !== "publicado") return { ok: false, status: 404, erro: "Atendimento indisponível no momento." };
  const { config } = await configParaConversa(a.orgId, a.id, "publicado");
  if (!config.widget.ativo) return { ok: false, status: 404, erro: "Atendimento indisponível no momento." };
  if (!dominioPermitido(opts.host, config.widget.dominios)) return { ok: false, status: 403, erro: "Este site não está autorizado a usar o atendimento." };
  if (!permitir(`a:${a.id}`, POR_AGENTE, opts.agora) || !permitir(`v:${a.id}:${opts.ip}`, POR_VISITANTE, opts.agora))
    return { ok: false, status: 429, erro: "Muitas tentativas. Tente de novo em alguns minutos." };
  return {
    ok: true,
    token: assinarTokenVoz({ orgId: a.orgId, agenteId: a.id, canal: "widget" }),
    agente: { nome: config.comportamento.nomeAgente, cor: config.widget.cor, texto: config.widget.texto },
  };
}
