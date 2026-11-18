/**
 * Provider rate card (USD). Researched Nov/2026; re-confirm before launch.
 * Every number that affects margin lives here so finance can audit one file.
 */
export const FX_BRL_PER_USD = 5.5;

/** Taxes (Simples/presumido estimate) + payment gateway, as share of revenue. */
export const TAX_AND_FEES_RATE = 0.16;

/** Safety buffer applied on top of raw COGS (FX swings, retries, failed calls). */
export const COGS_SAFETY_BUFFER = 0.15;

export const RATE_CARD = {
  telephony: {
    /** Twilio BR local number, inbound per minute. */
    twilioBrInboundPerMin: 0.01,
    /** Twilio BR local number, monthly. */
    twilioBrNumberMonthly: 4.25,
  },
  stt: {
    /** Deepgram Nova-3 multilingual streaming, list price per minute. */
    deepgramNova3MultiPerMin: 0.0092,
  },
  /** TTS engines, USD per 1M characters. Voices are sold under our own catalog names. */
  tts: {
    padrao: 40, // premium engine, turbo tier (default voice)
    ultra: 80, // premium engine, highest fidelity tier (add-on)
    economica: 16.49, // fallback engine
  },
  /** LLM, USD per 1M tokens. cacheRead for Haiku is an assumption (10% of input) — verify. */
  llm: {
    "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
    "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
    /** Free-tier rotation (Groq / OpenRouter :free): no per-token cost. */
    gratuito: { input: 0, output: 0, cacheRead: 0 },
  },
  /** Orchestration servers, recording storage, egress. Estimate. */
  infraPerMin: 0.006,
  /** Post-call summary + classification (Haiku). */
  postCallPerMin: 0.0005,
} as const;

export type TtsTier = keyof typeof RATE_CARD.tts;
export type LlmModel = keyof typeof RATE_CARD.llm;
