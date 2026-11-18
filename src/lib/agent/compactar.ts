import type Anthropic from "@anthropic-ai/sdk";

/**
 * Long calls: the oldest part of the conversation is replaced by a summary so the model stays fast
 * and focused (free engines have small context windows and per-minute token limits).
 * Pure helpers; the runtime asks the model for the summary text.
 */
export const LIMITE_MENSAGENS = 24;
export const MANTER_RECENTES = 10;

type Msg = Anthropic.MessageParam;

const blocos = (m: Msg): Anthropic.ContentBlockParam[] => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content);

/** A cut is only safe at the start of a customer turn: tool_use/tool_result pairs stay together. */
function inicioDeTurno(m: Msg): boolean {
  return m.role === "user" && blocos(m).some((b) => b.type === "text" && /(^|\n)Cliente: /.test(b.text)) && !blocos(m).some((b) => b.type === "tool_result");
}

/** Index where the recent part starts, or null when the conversation is still short. */
export function pontoDeCorte(msgs: Msg[], limite = LIMITE_MENSAGENS, manter = MANTER_RECENTES): number | null {
  if (msgs.length <= limite) return null;
  for (let i = msgs.length - manter; i > 0; i--) if (inicioDeTurno(msgs[i])) return i;
  return null;
}

/** Plain transcript of the old part, for the summarizer (context lines and big tool payloads trimmed). */
export function transcricao(msgs: Msg[]): string {
  const linhas: string[] = [];
  for (const m of msgs)
    for (const b of blocos(m)) {
      if (b.type === "text") {
        if (m.role === "assistant") linhas.push(`Recepcionista: ${b.text}`);
        else for (const l of b.text.split("\n")) if (/^(Cliente:|Resumo do início|Você já disse a saudação|\[Passagem interna\])/.test(l.trim())) linhas.push(l.trim());
      } else if (b.type === "tool_use") linhas.push(`(ação ${b.name}: ${JSON.stringify(b.input).slice(0, 300)})`);
      else if (b.type === "tool_result") linhas.push(`(resultado: ${String(typeof b.content === "string" ? b.content : JSON.stringify(b.content)).slice(0, 300)})`);
    }
  return linhas.join("\n");
}

export const SYSTEM_RESUMO =
  "Você resume o começo de uma ligação para a própria recepcionista continuar o atendimento. Em português, até 8 linhas curtas: quem é o cliente (nome, telefone, dados já informados), o que ele quer, o que já foi feito (horários oferecidos, agendamentos, casos passados à equipe) e o que ficou pendente. Não invente nada.";

/** Rebuilds the history: summary + acknowledgement + the recent part (roles keep alternating). */
export function aplicarResumo(msgs: Msg[], corte: number, resumo: string): Msg[] {
  return [
    { role: "user", content: [{ type: "text", text: `Resumo do início da ligação (as mensagens antigas foram resumidas):\n${resumo.trim()}` }] },
    { role: "assistant", content: [{ type: "text", text: "Entendido, sigo o atendimento a partir daqui." }] },
    ...msgs.slice(corte),
  ];
}
