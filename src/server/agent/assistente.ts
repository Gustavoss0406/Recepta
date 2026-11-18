import "server-only";
import { aplicarProposta, promptAssistente, propostaSchema, SYSTEM_ASSISTENTE, type IdSecao, type Proposta, type Secao } from "@/lib/agent/assistente";
import { getLlm } from "@/server/providers/llm";
import { ErroAgente, obterAgente, salvarRascunho } from "./agentes";

export interface ResultadoProposta {
  resumo: string;
  secoes: Secao[];
  proposta: Proposta;
}

/** Asks the model for a proposal; nothing is saved until the business approves sections. */
export async function proporMudancas(orgId: string, agenteId: string, pedido: string): Promise<ResultadoProposta> {
  if (pedido.trim().length < 8) throw new ErroAgente("Descreva um pouco mais o que você quer.");
  const llm = await getLlm();
  if (!llm.real) throw new ErroAgente("O assistente precisa do motor de conversa configurado (modo demonstração ativo).");
  const a = await obterAgente(orgId, agenteId);
  let proposta: Proposta;
  try {
    ({ dados: proposta } = await llm.estruturado({
      modelo: "claude-haiku-5-5",
      system: SYSTEM_ASSISTENTE,
      prompt: promptAssistente(a.rascunho, pedido),
      schema: propostaSchema,
      maxTokens: 3000,
      qualidade: "maxima",
    }));
  } catch {
    throw new ErroAgente("Não consegui montar a proposta agora. Tente de novo em alguns segundos.");
  }
  const { secoes } = aplicarProposta(a.rascunho, proposta);
  return { resumo: proposta.resumo || "Proposta pronta.", secoes, proposta };
}

/** Applies only the approved sections to the current draft (re-validated server-side). */
export async function aplicarMudancas(orgId: string, agenteId: string, proposta: unknown, secoes: IdSecao[]) {
  const p = propostaSchema.safeParse(proposta);
  if (!p.success) throw new ErroAgente("Proposta inválida. Gere de novo.");
  const a = await obterAgente(orgId, agenteId);
  const { config } = aplicarProposta(a.rascunho, p.data, secoes);
  return salvarRascunho(orgId, agenteId, config);
}
