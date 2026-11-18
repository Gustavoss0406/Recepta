import { llmCostUsd, ttsCostUsd } from "./cogs";
import { FX_BRL_PER_USD, RATE_CARD, type LlmModel, type TtsTier } from "./rates";

/**
 * Raw usage metered during one call. Written by the voice pipeline at hang-up and
 * reconciled monthly against provider invoices (target: < 5% drift).
 */
export interface CallUsage {
  callId: string;
  accountId: string;
  durationSeconds: number;
  telephonySeconds: number;
  sttSeconds: number;
  ttsChars: number;
  ttsTier: TtsTier;
  llmModel: LlmModel;
  llmInputTokens: number;
  llmCachedTokens: number;
  llmOutputTokens: number;
  postCallLlmInputTokens: number;
  postCallLlmOutputTokens: number;
}

export interface CallCost {
  callId: string;
  accountId: string;
  billableMinutes: number;
  usd: { telefonia: number; stt: number; tts: number; llm: number; posChamada: number; infra: number; total: number };
  brl: number;
}

/** Billing rounds each call up to the next started minute (like carriers). */
export function billableMinutes(durationSeconds: number): number {
  return Math.max(1, Math.ceil(durationSeconds / 60));
}

export function costCall(u: CallUsage, fx = FX_BRL_PER_USD): CallCost {
  const minutesExact = u.durationSeconds / 60;
  const telefonia = (u.telephonySeconds / 60) * RATE_CARD.telephony.twilioBrInboundPerMin;
  const stt = (u.sttSeconds / 60) * RATE_CARD.stt.deepgramNova3MultiPerMin;
  const tts = ttsCostUsd(u.ttsTier, u.ttsChars);
  const llm = llmCostUsd(u.llmModel, {
    input: u.llmInputTokens,
    cached: u.llmCachedTokens,
    output: u.llmOutputTokens,
  });
  const posChamada = llmCostUsd("claude-haiku-5-5", {
    input: u.postCallLlmInputTokens,
    cached: 0,
    output: u.postCallLlmOutputTokens,
  });
  const infra = minutesExact * RATE_CARD.infraPerMin;
  const total = telefonia + stt + tts + llm + posChamada + infra;
  return {
    callId: u.callId,
    accountId: u.accountId,
    billableMinutes: billableMinutes(u.durationSeconds),
    usd: { telefonia, stt, tts, llm, posChamada, infra, total },
    brl: total * fx,
  };
}

/** Roll a month of calls into account-level cost, for the internal margin dashboard. */
export function summarizeAccount(costs: CallCost[]) {
  const totalBrl = costs.reduce((s, c) => s + c.brl, 0);
  const minutes = costs.reduce((s, c) => s + c.billableMinutes, 0);
  return { calls: costs.length, minutes, totalBrl, brlPerMinute: minutes ? totalBrl / minutes : 0 };
}
