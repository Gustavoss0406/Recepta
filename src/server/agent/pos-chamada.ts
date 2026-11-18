import "server-only";
import { z } from "zod";
import type { AgentConfig } from "@/lib/agent/config";
import type { Resultado } from "@/db/schema";
import { getLlm, type UsoLlm } from "@/server/providers/llm";

export interface Analise {
  resumo: string;
  motivo: string;
  resultado: Resultado;
  dados: Record<string, string>;
  sucesso: boolean;
  justificativa: string;
  sentimento: "positivo" | "neutro" | "negativo";
  uso: UsoLlm;
  heuristica: boolean;
}

export function transcricaoTexto(turnos: { papel: string; texto: string }[]) {
  return turnos
    .filter((t) => t.papel !== "sistema")
    .map((t) => `${t.papel === "agente" ? "Agente" : "Cliente"}: ${t.texto}`)
    .join("\n");
}

/** Post-call: summary, extracted fields, outcome and success evaluation. */
export async function analisarConversa(
  config: AgentConfig,
  turnos: { papel: string; texto: string }[],
  acoes: string[],
): Promise<Analise> {
  const llm = await getLlm();
  if (!llm.real) return heuristica(config, turnos, acoes);

  const campos = Object.fromEntries(config.dados.campos.map((c) => [c.chave, z.string().describe(`${c.rotulo}. Vazio se não informado.`)]));
  const schema = z.object({
    resumo: z.string().describe("Resumo em 1 a 2 frases, em português"),
    motivo: z.string().describe("Motivo do contato em até 6 palavras"),
    resultado: z.enum(["resolvido", "repassado", "transferido", "nao_resolvido"]).describe("repassado: o caso foi passado para a equipe com relatório"),
    dados: z.object(campos),
    sucesso: z.boolean().describe("O agente atingiu o objetivo do cliente dentro das regras?"),
    justificativa: z.string().describe("Por que sucesso ou não, em uma frase"),
    sentimento: z.enum(["positivo", "neutro", "negativo"]),
  });
  let res;
  try {
    res = await llm.estruturado({
    modelo: "claude-haiku-5-5",
    system: "Você analisa ligações de atendimento de empresas brasileiras. Responda só com base na transcrição.",
    prompt: `Empresa: ${config.empresa.nome}\nAções executadas pelo agente: ${acoes.join(", ") || "nenhuma"}\n\nTranscrição:\n${transcricaoTexto(turnos)}`,
    schema,
    maxTokens: 1024,
    });
  } catch {
    // Free engines can be saturated or return malformed JSON: the call still gets a summary.
    return heuristica(config, turnos, acoes);
  }
  const { dados, uso } = res;
  const limpos = Object.fromEntries(Object.entries(dados.dados as Record<string, string>).filter(([, v]) => v && v.trim()));
  return { ...dados, dados: limpos, uso, heuristica: false };
}

function heuristica(config: AgentConfig, turnos: { papel: string; texto: string }[], acoes: string[]): Analise {
  const cliente = turnos.filter((t) => t.papel === "cliente").map((t) => t.texto);
  const resultado: Resultado = acoes.includes("agendar")
    ? "resolvido"
    : acoes.includes("transferir_para_humano")
      ? "transferido"
      : acoes.includes("repassar_para_equipe") || acoes.includes("anotar_recado")
        ? "repassado"
        : cliente.length > 0
          ? "resolvido"
          : "nao_resolvido";
  const tel = cliente.join(" ").match(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/)?.[0];
  return {
    resumo: cliente.length ? resumoHeuristico(cliente[0], acoes) : "Ligação sem fala do cliente.",
    motivo: cliente[0]?.split(/[.?!]/)[0].slice(0, 60) ?? "—",
    resultado,
    dados: tel ? { telefone: tel } : {},
    sucesso: resultado !== "nao_resolvido",
    justificativa: "Avaliação heurística (modo demonstração).",
    sentimento: /(absurdo|péssim|horr|reclam|irritad)/i.test(cliente.join(" ")) ? "negativo" : "neutro",
    uso: { input: 0, cached: 0, output: 0 },
    heuristica: true,
  };
}

const FEITOS: [string, string][] = [
  ["agendar", "o horário foi agendado"],
  ["transferir_para_humano", "a ligação foi transferida para a equipe"],
  ["repassar_para_equipe", "o caso foi passado para a equipe com relatório"],
  ["anotar_recado", "o caso foi passado para a equipe com relatório"],
  ["enviar_whatsapp", "a confirmação foi enviada por WhatsApp"],
];

/** Plain-language summary for demo mode (no model): what the caller asked and what happened. */
function resumoHeuristico(primeiraFala: string, acoes: string[]): string {
  const pedido = primeiraFala.trim().replace(/[.?!]+$/, "");
  const feitos = [...new Set(FEITOS.filter(([a]) => acoes.includes(a)).map(([, t]) => t))];
  const pedidoCurto = pedido.length > 120 ? `${pedido.slice(0, 118).trimEnd()}…` : pedido;
  return `Cliente perguntou: “${pedidoCurto}”. ${feitos.length ? `${feitos.join(" e ").replace(/^./, (c) => c.toUpperCase())}.` : "Respondido na ligação."}`;
}
