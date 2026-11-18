import { TAX_AND_FEES_RATE } from "./rates";
import type { Plan } from "./plans";

export interface MarginResult {
  revenueBrl: number;
  minutesUsed: number;
  overageMinutes: number;
  minutesCostBrl: number;
  fixedCostBrl: number;
  taxesBrl: number;
  profitBrl: number;
  /** 0..1 */
  marginPct: number;
}

/**
 * Gross margin of one subscribed account for a month.
 * @param usageRatio share of the allowance consumed (1 = full; >1 = overage billed at plan rate)
 */
export function planMargin(plan: Plan, cogsPerMinBrl: number, usageRatio = 1): MarginResult {
  if (plan.priceBrl == null) throw new Error("Plano sob consulta: use perMinuteMargin()");
  if (usageRatio < 0) throw new Error("usageRatio deve ser >= 0");

  const minutesUsed = plan.includedMinutes * usageRatio;
  const overageMinutes = Math.max(0, minutesUsed - plan.includedMinutes);
  const revenueBrl = plan.priceBrl + overageMinutes * (plan.overageBrl ?? 0);
  const minutesCostBrl = minutesUsed * cogsPerMinBrl;
  const taxesBrl = revenueBrl * TAX_AND_FEES_RATE;
  const profitBrl = revenueBrl - minutesCostBrl - plan.fixedCostBrl - taxesBrl;
  return {
    revenueBrl,
    minutesUsed,
    overageMinutes,
    minutesCostBrl,
    fixedCostBrl: plan.fixedCostBrl,
    taxesBrl,
    profitBrl,
    marginPct: revenueBrl > 0 ? profitBrl / revenueBrl : 0,
  };
}

/** Margin of a single billed minute (overage, enterprise rate, add-on). */
export function perMinuteMargin(priceBrl: number, cogsPerMinBrl: number) {
  const taxesBrl = priceBrl * TAX_AND_FEES_RATE;
  const profitBrl = priceBrl - cogsPerMinBrl - taxesBrl;
  return { priceBrl, taxesBrl, profitBrl, marginPct: profitBrl / priceBrl };
}

/** Lowest per-minute price that still yields `targetMargin` after taxes. */
export function minPricePerMinute(cogsPerMinBrl: number, targetMargin: number): number {
  return cogsPerMinBrl / (1 - TAX_AND_FEES_RATE - targetMargin);
}
