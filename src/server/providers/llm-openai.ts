import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { EstruturadoReq, TurnoReq, TurnoRes, UsoLlm } from "./llm";

/**
 * OpenAI-compatible chat completions (Groq, OpenRouter, any vLLM/SGLang server).
 * The runtime speaks Anthropic's message format; this module converts both ways so the
 * agent runtime, tools and tests stay identical whichever engine answers.
 */
export interface EndpointOpenAI {
  nome: string;
  baseURL: string; // e.g. https://api.groq.com/openai/v1
  modelo: string;
  chave: string; // "proxy-injected" in sandboxed environments: the proxy sets the real header
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
  /** Extra request fields (e.g. NVIDIA reasoning models: chat_template_kwargs.enable_thinking = false). */
  corpoExtra?: Record<string, unknown>;
}

export class ErroProvedor extends Error {
  constructor(
    msg: string,
    readonly status: number,
    readonly tentarDepoisMs?: number,
  ) {
    super(msg);
  }
}

type MsgOA =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** Anthropic messages → OpenAI messages (tool_use ↔ tool_calls, tool_result ↔ role:tool). */
export function paraOpenAI(system: string, messages: Anthropic.MessageParam[]): MsgOA[] {
  const out: MsgOA[] = [{ role: "system", content: system }];
  for (const m of messages) {
    const blocos = typeof m.content === "string" ? [{ type: "text", text: m.content } as Anthropic.TextBlockParam] : m.content;
    if (m.role === "assistant") {
      const texto = blocos
        .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const calls = blocos
        .filter((b): b is Anthropic.ToolUseBlockParam => b.type === "tool_use")
        .map((b) => ({ id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: "assistant", content: texto || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      const resultados = blocos.filter((b): b is Anthropic.ToolResultBlockParam => b.type === "tool_result");
      for (const r of resultados)
        out.push({ role: "tool", tool_call_id: r.tool_use_id, content: typeof r.content === "string" ? r.content : JSON.stringify(r.content ?? "") });
      const texto = blocos
        .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
        .map((b) => b.text)
        .join("\n\n");
      if (texto) out.push({ role: "user", content: texto });
    }
  }
  return out;
}

export function ferramentasOpenAI(tools: Anthropic.Tool[]) {
  return tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description ?? "", parameters: t.input_schema } }));
}

let seq = 0;
function idTool() {
  return `call_${Date.now().toString(36)}${(seq++).toString(36)}`;
}

/** Some open models leak reasoning or tool-call syntax into text; keep only what can be spoken. */
/**
 * What the receptionist says is spoken: no markdown, lists become one sentence, line breaks become
 * spaces (a "- 08:00\n- 08:30" list would be read as "hífen oito horas…").
 */
export function limparFala(t: string): string {
  const semMarcas = t
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\|[^|]*\|>/g, "")
    .replace(/\*\*|__|`|^#+\s*/gm, "");
  const linhas = semMarcas.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const itens = linhas.filter((l) => /^([-*•]|\d+[.)])\s+/.test(l)).map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, "").replace(/[.;]$/, ""));
  const juntadas: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!/^([-*•]|\d+[.)])\s+/.test(linhas[i])) {
      juntadas.push(linhas[i]);
      continue;
    }
    // a run of list items → "a, b ou c"
    const bloco: string[] = [];
    while (i < linhas.length && /^([-*•]|\d+[.)])\s+/.test(linhas[i])) bloco.push(itens.shift()!), i++;
    i--;
    juntadas.push(bloco.length > 1 ? `${bloco.slice(0, -1).join(", ")} ou ${bloco.at(-1)}.` : `${bloco[0]}.`);
  }
  return juntadas.join(" ").replace(/:\s+(?=[A-ZÀ-Úa-zà-ú])/g, ": ").replace(/\s{2,}/g, " ").trim();
}

export async function chamar(e: EndpointOpenAI, corpo: Record<string, unknown>): Promise<{ msg: { content?: string | null; tool_calls?: { id?: string; function: { name: string; arguments: string } }[] }; finish: string | null; uso: UsoLlm }> {
  let r: Response;
  try {
    r = await fetch(`${e.baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      // keyless endpoints (OVH anonymous tier) get no Authorization header at all
      headers: { "content-type": "application/json", ...(e.chave ? { authorization: `Bearer ${e.chave}` } : {}), ...e.extraHeaders },
      body: JSON.stringify({ model: e.modelo, ...corpo, ...e.corpoExtra }),
      signal: AbortSignal.timeout(e.timeoutMs),
    });
  } catch (err) {
    throw new ErroProvedor(`${e.nome}: ${err instanceof Error ? err.name : "falha de rede"}`, 0);
  }
  if (!r.ok) {
    const ra = Number(r.headers.get("retry-after"));
    const txt = (await r.text().catch(() => "")).slice(0, 300);
    throw new ErroProvedor(`${e.nome} ${r.status}: ${txt}`, r.status, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined);
  }
  const j = (await r.json()) as {
    choices?: { message: { content?: string | null; tool_calls?: { id?: string; function: { name: string; arguments: string } }[] }; finish_reason: string | null }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    error?: { message?: string; code?: number };
  };
  if (j.error || !j.choices?.length) throw new ErroProvedor(`${e.nome}: ${j.error?.message ?? "resposta vazia"}`, j.error?.code ?? 502);
  const c = j.choices[0];
  return {
    msg: c.message,
    finish: c.finish_reason,
    uso: { input: j.usage?.prompt_tokens ?? 0, cached: j.usage?.prompt_tokens_details?.cached_tokens ?? 0, output: j.usage?.completion_tokens ?? 0 },
  };
}

export async function turnoOpenAI(e: EndpointOpenAI, req: TurnoReq): Promise<TurnoRes> {
  const { msg, finish, uso } = await chamar(e, {
    messages: paraOpenAI(req.system, req.messages),
    ...(req.tools.length ? { tools: ferramentasOpenAI(req.tools), tool_choice: "auto" } : {}),
    max_tokens: req.maxTokens ?? 600,
    temperature: 0.3,
  });
  const content: Anthropic.ContentBlock[] = [];
  const texto = limparFala(msg.content ?? "");
  if (texto) content.push({ type: "text", text: texto, citations: null } as Anthropic.TextBlock);
  for (const tc of msg.tool_calls ?? []) {
    let input: unknown = {};
    try {
      input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
    } catch {
      throw new ErroProvedor(`${e.nome}: argumentos de ferramenta inválidos`, 502);
    }
    if (!req.tools.some((t) => t.name === tc.function.name)) throw new ErroProvedor(`${e.nome}: ferramenta inexistente ${tc.function.name}`, 502);
    content.push({ type: "tool_use", id: tc.id || idTool(), name: tc.function.name, input, caller: { type: "direct" } } as unknown as Anthropic.ToolUseBlock);
  }
  if (!content.length) throw new ErroProvedor(`${e.nome}: resposta sem texto nem ferramenta`, 502);
  return { content, stopReason: content.some((b) => b.type === "tool_use") ? "tool_use" : finish === "length" ? "max_tokens" : "end_turn", uso };
}

/** JSON output validated with zod (one repair attempt with the validation error). */
export async function estruturadoOpenAI<T>(e: EndpointOpenAI, req: EstruturadoReq<T>): Promise<{ dados: T; uso: UsoLlm }> {
  const esquema = JSON.stringify(z.toJSONSchema(req.schema as z.ZodType));
  const base = [
    { role: "system" as const, content: `${req.system}\nResponda SOMENTE com um objeto JSON válido que siga este JSON Schema:\n${esquema}` },
    { role: "user" as const, content: req.prompt },
  ];
  const uso: UsoLlm = { input: 0, cached: 0, output: 0 };
  let msgs: MsgOA[] = base;
  for (let i = 0; i < 2; i++) {
    // NVIDIA reasoning models would spend the whole budget "thinking" and return no JSON: off for structured calls
    const semRaciocinio = /nvidia\.com/.test(e.baseURL) ? { chat_template_kwargs: { enable_thinking: false } } : {};
    const r = await chamar(
      { ...e, corpoExtra: { ...e.corpoExtra, ...semRaciocinio, max_tokens: req.maxTokens ?? 1500 } },
      { messages: msgs, max_tokens: req.maxTokens ?? 1500, temperature: 0, response_format: { type: "json_object" } },
    );
    uso.input += r.uso.input;
    uso.output += r.uso.output;
    const bruto = limparFala(r.msg.content ?? "").replace(/^```(?:json)?|```$/g, "").trim();
    try {
      const p = (req.schema as z.ZodType).safeParse(JSON.parse(bruto));
      if (p.success) return { dados: p.data as T, uso };
      msgs = [...base, { role: "assistant", content: bruto }, { role: "user", content: `JSON inválido para o schema: ${p.error.message.slice(0, 500)}. Corrija e responda só o JSON.` }];
    } catch {
      msgs = [...base, { role: "assistant", content: bruto }, { role: "user", content: "A resposta não era JSON. Responda só o objeto JSON." }];
    }
  }
  throw new ErroProvedor(`${e.nome}: saída estruturada inválida`, 502);
}
