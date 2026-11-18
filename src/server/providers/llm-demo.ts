import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { EstruturadoReq, Llm, TurnoReq, TurnoRes } from "./llm";

/**
 * Demonstration engine used when no ANTHROPIC_API_KEY is configured.
 * Deterministic and rule-based: it exercises the real tools, ledger and UI, but it is NOT the
 * product's AI. The UI labels every conversation produced by it as "modo demonstração".
 */
export class DemoLlm implements Llm {
  readonly real = false;

  async turno(req: TurnoReq): Promise<TurnoRes> {
    const ferramentas = new Set(req.tools.map((t) => t.name));
    const ultimo = req.messages.at(-1);
    const blocos = Array.isArray(ultimo?.content) ? ultimo.content : [{ type: "text", text: String(ultimo?.content ?? "") }];
    const resultados = blocos.filter((b): b is Anthropic.ToolResultBlockParam => b.type === "tool_result");

    if (resultados.length) return this.aposFerramenta(req, resultados);

    const textoCliente = blocos
      .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
      .map((b) => b.text)
      .find((t) => t.startsWith("Cliente:"))
      ?.slice("Cliente:".length)
      .trim()
      .toLowerCase() ?? "";
    const conhecimento = blocos
      .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
      .map((b) => b.text)
      .find((t) => t.startsWith("Conhecimento"));

    const usar = (name: string, input: Record<string, unknown>, fala = ""): TurnoRes => ({
      content: [
        ...(fala ? [texto(fala)] : []),
        { type: "tool_use", id: `demo_${name}_${Date.now()}`, name, input, caller: { type: "direct" } } as unknown as Anthropic.ToolUseBlock,
      ],
      stopReason: "tool_use",
      uso: { input: 0, cached: 0, output: 0 },
    });
    const falar = (t: string): TurnoRes => ({ content: [texto(t)], stopReason: "end_turn", uso: { input: 0, cached: 0, output: 0 } });

    if (/(humano|atendente|pessoa|falar com (o|a|alguém)|gerente|m[ée]dico)/.test(textoCliente) && ferramentas.has("transferir_para_humano"))
      return usar("transferir_para_humano", { motivo: "Cliente pediu para falar com uma pessoa" }, "Claro, vou te passar para alguém da equipe.");
    if (/(tchau|obrigad|s[óo] isso|at[ée] mais|valeu)/.test(textoCliente) && ferramentas.has("encerrar_ligacao"))
      return usar("encerrar_ligacao", {}, "Eu que agradeço! Tenha um ótimo dia.");
    if (/(recado|retorn|me liga|ligar de volta|desconto|reclama|equipe)/.test(textoCliente) && ferramentas.has("repassar_para_equipe"))
      return usar(
        "repassar_para_equipe",
        {
          motivo: /desconto/.test(textoCliente) ? "Pedido de desconto, precisa de decisão da equipe" : "Cliente pediu retorno da equipe",
          o_que_o_cliente_quer: textoCliente,
          urgencia: /reclama|urgente|dor/.test(textoCliente) ? "alta" : "media",
          proximo_passo: "Ligar de volta para o cliente",
        },
        "Certo, vou passar para a equipe.",
      );

    const ofertados = horariosOfertados(req.messages);
    if (ofertados.length && /(primeir|segund|pode ser|esse|essa|fechado|sim|\d)/.test(textoCliente) && ferramentas.has("agendar")) {
      const escolhido = /segund/.test(textoCliente) && ofertados[1] ? ofertados[1] : ofertados[0];
      return usar("agendar", { inicio: escolhido.inicio, nome: "Cliente da demonstração", telefone: "" });
    }
    if (/(agend|marcar|consulta|hor[áa]rio|reserv|visita|mesa)/.test(textoCliente) && ferramentas.has("consultar_horarios"))
      return usar("consultar_horarios", {}, "Deixa eu ver a agenda.");

    if (conhecimento) {
      const trecho = conhecimento.split("\n").find((l) => l.startsWith("- "))?.slice(2);
      if (trecho) return falar(`${primeiraFrase(trecho)} Posso ajudar com mais alguma coisa?`);
    }
    return falar("Essa eu prefiro confirmar com a equipe. Quer que alguém te retorne?");
  }

  private aposFerramenta(req: TurnoReq, resultados: Anthropic.ToolResultBlockParam[]): TurnoRes {
    const r = resultados[0];
    const nome = nomeDaFerramenta(req.messages, r.tool_use_id);
    const dados = parse(r.content);
    const fim = (t: string): TurnoRes => ({ content: [texto(t)], stopReason: "end_turn", uso: { input: 0, cached: 0, output: 0 } });
    switch (nome) {
      case "consultar_horarios": {
        const h = (dados?.horarios as { rotulo: string }[] | undefined) ?? [];
        if (!h.length) return fim("Não encontrei horários livres nesse período. Quer que alguém da equipe te retorne?");
        return fim(`Tenho ${h[0].rotulo}${h[1] ? ` ou ${h[1].rotulo}` : ""}. Qual fica melhor?`);
      }
      case "agendar":
        return dados?.ok
          ? fim(`Prontinho, ficou agendado para ${dados.rotulo}. Posso ajudar com mais alguma coisa?`)
          : fim("Esse horário acabou de ser ocupado. Quer outra opção?");
      case "transferir_para_humano":
        return dados?.ok ? fim("Um momento, estou transferindo.") : fim("Agora não tem ninguém disponível. Posso pedir para a equipe te retornar?");
      case "repassar_para_equipe":
        return fim("Pronto, passei seu caso para a equipe. Alguém vai te retornar assim que possível.");
      default:
        return fim("Certo.");
    }
  }

  async estruturado<T>(_req: EstruturadoReq<T>): Promise<{ dados: T; uso: { input: number; cached: number; output: number } }> {
    throw new ModoDemonstracao();
  }
}

export class ModoDemonstracao extends Error {
  constructor() {
    super("Modo demonstração: configure ANTHROPIC_API_KEY para a análise completa.");
  }
}

function texto(t: string): Anthropic.TextBlock {
  return { type: "text", text: t, citations: null } as Anthropic.TextBlock;
}

function primeiraFrase(t: string): string {
  const m = t.match(/^.{20,220}?[.!?](\s|$)/);
  return (m ? m[0] : t.slice(0, 200)).trim();
}

function parse(c: Anthropic.ToolResultBlockParam["content"]): Record<string, unknown> | null {
  const s = typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => ("text" in b ? b.text : "")).join("") : "";
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function nomeDaFerramenta(msgs: Anthropic.MessageParam[], id: string): string | undefined {
  for (const m of msgs)
    if (m.role === "assistant" && Array.isArray(m.content))
      for (const b of m.content) if (b.type === "tool_use" && b.id === id) return b.name;
  return undefined;
}

function horariosOfertados(msgs: Anthropic.MessageParam[]): { inicio: string; rotulo: string }[] {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b.type !== "tool_result") continue;
      if (nomeDaFerramenta(msgs, b.tool_use_id) !== "consultar_horarios") continue;
      const d = parse(b.content);
      return (d?.horarios as { inicio: string; rotulo: string }[]) ?? [];
    }
  }
  return [];
}
