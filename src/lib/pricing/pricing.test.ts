import { describe, expect, it } from "vitest";
import { cogsPerMinute, PHASE4_COGS_BRL_PER_MIN, PRICING_COGS_BRL_PER_MIN } from "./cogs";
import { billableMinutes, costCall, summarizeAccount, type CallUsage } from "./ledger";
import { minPricePerMinute, perMinuteMargin, planMargin } from "./margin";
import { ENTERPRISE_FLOOR_BRL_PER_MIN, getPlan, PLANS } from "./plans";

describe("COGS por minuto", () => {
  it("bate com a planilha do plano (~US$ 0,047 / ~R$ 0,26)", () => {
    const c = cogsPerMinute();
    expect(c.totalUsd).toBeCloseTo(0.0467, 3);
    expect(c.totalBrl).toBeCloseTo(0.257, 2);
  });

  it("o COGS usado no preço cobre o COGS real com folga de 15%", () => {
    expect(PRICING_COGS_BRL_PER_MIN).toBeGreaterThanOrEqual(cogsPerMinute().bufferedBrl);
  });

  it("modo avançado (Sonnet) custa ~R$ 0,08/min a mais com cache de prompt", () => {
    const cached = { ttsCharsPerMin: 450, llmInputTokPerMin: 4_000, llmCachedTokPerMin: 21_000, llmOutputTokPerMin: 400 };
    const haiku = cogsPerMinute({ profile: cached });
    const sonnet = cogsPerMinute({ profile: cached, llm: "claude-sonnet-5-5" });
    expect(sonnet.totalBrl - haiku.totalBrl).toBeGreaterThan(0.05);
    expect(sonnet.totalBrl - haiku.totalBrl).toBeLessThan(0.1);
  });

  it("Voz Ultra custa ~R$ 0,10/min a mais e o add-on (+R$ 0,20) tem margem", () => {
    const delta = cogsPerMinute({ tts: "ultra" }).totalBrl - cogsPerMinute().totalBrl;
    expect(delta).toBeCloseTo(0.099, 2);
    expect(perMinuteMargin(0.2, delta).marginPct).toBeGreaterThan(0.3);
  });
});

describe("Margem por plano (uso de 100% da franquia)", () => {
  const cases = [
    { id: "start", phase2: 64.48, phase4: 102.48 },
    { id: "pro", phase2: 179.48, phase4: 293.48 },
    { id: "business", phase2: 409.6, phase4: 751.6 },
  ] as const;

  for (const c of cases) {
    it(`${c.id}: lucro bruto Fase 2 e Fase 4`, () => {
      const plan = getPlan(c.id);
      expect(planMargin(plan, PRICING_COGS_BRL_PER_MIN).profitBrl).toBeCloseTo(c.phase2, 1);
      expect(planMargin(plan, PHASE4_COGS_BRL_PER_MIN).profitBrl).toBeCloseTo(c.phase4, 1);
    });
  }

  it("regra: todo plano pago tem margem >= 30% (Fase 2) e >= 50% (Fase 4) com uso total", () => {
    for (const p of PLANS.filter((p) => p.priceBrl && p.priceBrl > 0)) {
      expect(planMargin(p, PRICING_COGS_BRL_PER_MIN).marginPct).toBeGreaterThanOrEqual(0.3);
      expect(planMargin(p, PHASE4_COGS_BRL_PER_MIN).marginPct).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("multiplicador sobre o COGS: Business é o piso (incluso 2,18x; excedente 2,39x)", () => {
    for (const p of PLANS.filter((p) => p.priceBrl && p.priceBrl > 0)) {
      expect(p.priceBrl! / p.includedMinutes).toBeGreaterThanOrEqual(2.15 * PRICING_COGS_BRL_PER_MIN);
      expect(p.overageBrl!).toBeGreaterThanOrEqual(2.35 * PRICING_COGS_BRL_PER_MIN);
    }
  });

  it("excedente cobra o minuto extra e mantém margem", () => {
    const pro = getPlan("pro");
    const m = planMargin(pro, PRICING_COGS_BRL_PER_MIN, 1.5);
    expect(m.overageMinutes).toBe(300);
    expect(m.revenueBrl).toBeCloseTo(497 + 300 * 0.89, 2);
    expect(m.marginPct).toBeGreaterThan(0.35);
  });

  it("uso médio de 60% eleva a margem", () => {
    const start = getPlan("start");
    expect(planMargin(start, PRICING_COGS_BRL_PER_MIN, 0.6).marginPct).toBeGreaterThan(0.45);
  });

  it("Enterprise: piso por fase mantém margem mínima", () => {
    expect(perMinuteMargin(ENTERPRISE_FLOOR_BRL_PER_MIN.phase2, PRICING_COGS_BRL_PER_MIN).marginPct).toBeGreaterThan(0.3);
    expect(perMinuteMargin(ENTERPRISE_FLOOR_BRL_PER_MIN.phase4, PHASE4_COGS_BRL_PER_MIN).marginPct).toBeGreaterThan(0.54);
  });

  it("preço mínimo para margem alvo", () => {
    expect(minPricePerMinute(0.33, 0.5)).toBeCloseTo(0.97, 2);
  });
});

describe("Ledger de custo por chamada", () => {
  const usage: CallUsage = {
    callId: "c1",
    accountId: "a1",
    durationSeconds: 125,
    telephonySeconds: 125,
    sttSeconds: 125,
    ttsChars: 940,
    ttsTier: "padrao",
    llmModel: "claude-haiku-5-5",
    llmInputTokens: 52_000,
    llmCachedTokens: 0,
    llmOutputTokens: 830,
    postCallLlmInputTokens: 3_000,
    postCallLlmOutputTokens: 250,
  };

  it("arredonda para o minuto iniciado", () => {
    expect(billableMinutes(125)).toBe(3);
    expect(billableMinutes(5)).toBe(1);
  });

  it("custo de uma chamada de ~2 min fica perto de 2x o COGS por minuto", () => {
    const c = costCall(usage);
    const perMinute = c.brl / (125 / 60);
    expect(perMinute).toBeGreaterThan(0.2);
    expect(perMinute).toBeLessThan(PRICING_COGS_BRL_PER_MIN);
  });

  it("resume a conta", () => {
    const s = summarizeAccount([costCall(usage), costCall({ ...usage, callId: "c2", durationSeconds: 40 })]);
    expect(s.calls).toBe(2);
    expect(s.minutes).toBe(4);
  });
});

import { quote, recommendPlan } from "./recommend";

describe("Recomendação de plano", () => {
  it("uso baixo cai no Start", () => {
    expect(recommendPlan(150).plan.id).toBe("start");
  });
  it("troca para o Pro quando o excedente do Start passa do preço do Pro", () => {
    // Start a 500 min: 197 + 300*0.99 = 494 < 497 → Start; a 510 min: 503.9 > 497 → Pro
    expect(recommendPlan(500).plan.id).toBe("start");
    expect(recommendPlan(510).plan.id).toBe("pro");
  });
  it("uso alto vai para Business e acima de 10 mil para Enterprise", () => {
    expect(recommendPlan(1800).plan.id).toBe("business");
    expect(recommendPlan(12_000).plan.id).toBe("enterprise");
  });
  it("cotação soma excedente", () => {
    expect(quote(getPlan("pro"), 700)!.monthlyBrl).toBeCloseTo(497 + 100 * 0.89, 2);
  });
});
