import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { LlmModel } from "@/lib/pricing/rates";

export interface UsoLlm {
  input: number;
  cached: number;
  output: number;
}

export interface TurnoReq {
  modelo: LlmModel;
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  maxTokens?: number;
}

export interface TurnoRes {
  content: Anthropic.ContentBlock[];
  stopReason: string | null;
  uso: UsoLlm;
}

export interface EstruturadoReq<T> {
  modelo: LlmModel;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}

export interface Llm {
  /** false = demonstration mode (scripted), shown as such in the UI. */
  readonly real: boolean;
  /** true = free-tier engines (cost ledger records zero LLM cost). */
  readonly gratuito?: boolean;
  turno(req: TurnoReq): Promise<TurnoRes>;
  estruturado<T>(req: EstruturadoReq<T>): Promise<{ dados: T; uso: UsoLlm }>;
}

function usoDe(u: Anthropic.Usage): UsoLlm {
  return {
    input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    cached: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
  };
}

export class AnthropicLlm implements Llm {
  readonly real = true;
  private client: Anthropic;

  constructor(apiKey: string) {
    // Pin the base URL: the host environment may define ANTHROPIC_BASE_URL for unrelated tooling.
    this.client = new Anthropic({ apiKey, baseURL: process.env.RECEPTA_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com" });
  }

  async turno(req: TurnoReq): Promise<TurnoRes> {
    const r = await this.client.messages.create({
      model: req.modelo,
      max_tokens: req.maxTokens ?? 1024,
      // Stable system prompt cached; low effort keeps voice turns fast.
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: req.messages,
      tools: req.tools,
      tool_choice: { type: "auto" },
      output_config: { effort: "low" },
    });
    if (r.stop_reason === "refusal") {
      return {
        content: [{ type: "text", text: "Desculpe, não consigo ajudar com isso. Posso ajudar com outra coisa?", citations: null } as Anthropic.TextBlock],
        stopReason: "refusal",
        uso: usoDe(r.usage),
      };
    }
    return { content: r.content, stopReason: r.stop_reason, uso: usoDe(r.usage) };
  }

  async estruturado<T>(req: EstruturadoReq<T>) {
    const r = await this.client.messages.parse({
      model: req.modelo,
      max_tokens: req.maxTokens ?? 2048,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
      output_config: { format: zodOutputFormat(req.schema as z.ZodType), effort: "low" },
    });
    if (r.parsed_output == null) throw new Error(`Saída estruturada inválida (stop_reason=${r.stop_reason})`);
    return { dados: r.parsed_output as T, uso: usoDe(r.usage) };
  }
}

const g = globalThis as unknown as { __receptaLlm?: Llm };

export function setLlm(llm: Llm | undefined) {
  g.__receptaLlm = llm;
}

/**
 * Engine selection (LLM_MOTOR): "rotacao" = free providers in rotation (default when a
 * Groq/OpenRouter key is configured), "anthropic" = Claude, "demo" = scripted.
 */
export async function getLlm(): Promise<Llm> {
  if (g.__receptaLlm) return g.__receptaLlm;
  const motor = process.env.LLM_MOTOR;
  const key = process.env.ANTHROPIC_API_KEY;
  const { LlmRotativo, provedoresPadrao } = await import("./llm-rotacao");
  const provs = provedoresPadrao();
  if ((motor === "rotacao" || !motor) && provs.length) g.__receptaLlm = new LlmRotativo(provs);
  else if ((motor === "anthropic" || !motor) && key) g.__receptaLlm = new AnthropicLlm(key);
  else {
    const { DemoLlm } = await import("./llm-demo");
    g.__receptaLlm = new DemoLlm();
  }
  return g.__receptaLlm;
}

export function textoDe(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}
