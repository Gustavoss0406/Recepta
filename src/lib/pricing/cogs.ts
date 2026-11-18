import {
  COGS_SAFETY_BUFFER,
  FX_BRL_PER_USD,
  RATE_CARD,
  type LlmModel,
  type TtsTier,
} from "./rates";

/** Traffic profile of one minute of an average call. */
export interface MinuteProfile {
  /** Characters the agent speaks per call-minute (agent talks ~50% of the time). */
  ttsCharsPerMin: number;
  /** Uncached LLM input tokens per call-minute. */
  llmInputTokPerMin: number;
  /** Cached LLM input tokens per call-minute (system prompt + knowledge base prefix). */
  llmCachedTokPerMin: number;
  llmOutputTokPerMin: number;
}

/** Plan baseline: ~6 turns/min, ~25k input tokens (no caching assumed), ~400 output tokens. */
export const DEFAULT_PROFILE: MinuteProfile = {
  ttsCharsPerMin: 450,
  llmInputTokPerMin: 25_000,
  llmCachedTokPerMin: 0,
  llmOutputTokPerMin: 400,
};

export interface CostLine {
  key: "telefonia" | "stt" | "tts" | "llm" | "posChamada" | "infra";
  label: string;
  usd: number;
  brl: number;
}

export interface CogsBreakdown {
  lines: CostLine[];
  totalUsd: number;
  totalBrl: number;
  /** total × (1 + safety buffer) */
  bufferedBrl: number;
}

export interface CogsOptions {
  profile?: MinuteProfile;
  tts?: TtsTier;
  llm?: LlmModel;
  fx?: number;
}

export function llmCostUsd(
  model: LlmModel,
  tokens: { input: number; cached: number; output: number },
): number {
  const r = RATE_CARD.llm[model];
  return (tokens.input * r.input + tokens.cached * r.cacheRead + tokens.output * r.output) / 1e6;
}

export function ttsCostUsd(tier: TtsTier, chars: number): number {
  return (chars * RATE_CARD.tts[tier]) / 1e6;
}

/** Cost of one call-minute, line by line. */
export function cogsPerMinute(opts: CogsOptions = {}): CogsBreakdown {
  const p = opts.profile ?? DEFAULT_PROFILE;
  const fx = opts.fx ?? FX_BRL_PER_USD;
  const tts = opts.tts ?? "padrao";
  const llm = opts.llm ?? "claude-haiku-5-5";

  const raw: Omit<CostLine, "brl">[] = [
    { key: "telefonia", label: "Telefonia (entrada BR)", usd: RATE_CARD.telephony.twilioBrInboundPerMin },
    { key: "stt", label: "Transcrição (STT)", usd: RATE_CARD.stt.deepgramNova3MultiPerMin },
    { key: "tts", label: "Voz (TTS)", usd: ttsCostUsd(tts, p.ttsCharsPerMin) },
    {
      key: "llm",
      label: "Inteligência (LLM)",
      usd: llmCostUsd(llm, {
        input: p.llmInputTokPerMin,
        cached: p.llmCachedTokPerMin,
        output: p.llmOutputTokPerMin,
      }),
    },
    { key: "posChamada", label: "Resumo pós-chamada", usd: RATE_CARD.postCallPerMin },
    { key: "infra", label: "Infraestrutura", usd: RATE_CARD.infraPerMin },
  ];
  const lines = raw.map((l) => ({ ...l, brl: l.usd * fx }));
  const totalUsd = lines.reduce((s, l) => s + l.usd, 0);
  const totalBrl = totalUsd * fx;
  return { lines, totalUsd, totalBrl, bufferedBrl: totalBrl * (1 + COGS_SAFETY_BUFFER) };
}

/**
 * Conservative COGS used to set prices (R$/min). Must stay >= cogsPerMinute().bufferedBrl —
 * enforced by tests, so a rate-card increase fails CI before it silently eats margin.
 */
export const PRICING_COGS_BRL_PER_MIN = 0.33;

/** Target COGS after phase 4 (direct SIP, self-hosted STT, own voice model if it passes the blind test). */
export const PHASE4_COGS_BRL_PER_MIN = 0.14;
