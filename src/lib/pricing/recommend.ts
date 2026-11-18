import { PLANS, type Plan } from "./plans";

export interface Quote {
  plan: Plan;
  monthlyBrl: number;
  overageMinutes: number;
  effectivePerMinute: number;
}

/** Monthly bill of a plan for a given usage (allowance + billed overage). */
export function quote(plan: Plan, minutes: number): Quote | null {
  if (plan.priceBrl == null || plan.overageBrl == null) return null;
  const overageMinutes = Math.max(0, minutes - plan.includedMinutes);
  const monthlyBrl = plan.priceBrl + overageMinutes * plan.overageBrl;
  return { plan, monthlyBrl, overageMinutes, effectivePerMinute: minutes > 0 ? monthlyBrl / minutes : 0 };
}

/** Cheapest self-serve plan for the usage; above 10k minutes, Enterprise is suggested. */
export function recommendPlan(minutes: number): Quote | { plan: Plan; monthlyBrl: null } {
  if (minutes > 10_000) return { plan: PLANS.find((p) => p.id === "enterprise")!, monthlyBrl: null };
  const quotes = PLANS.map((p) => quote(p, minutes)).filter((q): q is Quote => q !== null && q.plan.priceBrl! > 0);
  return quotes.reduce((best, q) => (q.monthlyBrl < best.monthlyBrl ? q : best));
}

/** Cost of a full-time CLT receptionist (salary + charges), BRL/month — comparison baseline. */
export const RECEPCIONISTA_BRL_MES = 4200;
