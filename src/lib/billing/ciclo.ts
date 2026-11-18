import { getPlan, type Plan, type PlanId } from "@/lib/pricing/plans";

export const TRIAL_DIAS = 7;
export const MINUTOS_TESTE_GRATIS = 60;
export const SIMULACOES_POR_PLANO: Record<PlanId, number> = {
  teste: 50,
  start: 200,
  pro: 1000,
  business: 5000,
  enterprise: 20000,
};
export const DIAS_ATE_SUSPENDER = 7;

/** Adds calendar months, clamping to the last day (31/jan + 1 → 28 or 29/fev). */
export function somarMeses(d: Date, meses: number): Date {
  const r = new Date(d);
  const dia = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(dia, ultimo));
  return r;
}

export function fimDoCiclo(inicio: Date, ciclo: "mensal" | "anual"): Date {
  return somarMeses(inicio, ciclo === "anual" ? 12 : 1);
}

export interface UsoCiclo {
  minutos: number; // billable minutes of real calls (excluding peak)
  minutosPico: number; // minutes of calls taken above the concurrency limit
  minutosTeste: number; // browser/simulator test minutes
}

export interface ItemFatura {
  descricao: string;
  quantidade: number;
  unitarioCentavos: number;
  totalCentavos: number;
}

const centavos = (brl: number) => Math.round(brl * 100);

/** Test minutes beyond the free allowance count against the franchise. */
export function minutosFranquia(uso: UsoCiclo): number {
  return uso.minutos + Math.max(0, uso.minutosTeste - MINUTOS_TESTE_GRATIS);
}

/** Annual billing = 10 × monthly (2 months free). */
export function precoCiclo(plan: Plan, ciclo: "mensal" | "anual"): number {
  return (plan.priceBrl ?? 0) * (ciclo === "anual" ? 10 : 1);
}

export function itensFatura(planoId: PlanId, ciclo: "mensal" | "anual", uso: UsoCiclo, creditoProRataBrl = 0): ItemFatura[] {
  const plan = getPlan(planoId);
  const itens: ItemFatura[] = [];
  const base = precoCiclo(plan, ciclo);
  if (base > 0)
    itens.push({ descricao: `Plano ${plan.name} (${ciclo})`, quantidade: 1, unitarioCentavos: centavos(base), totalCentavos: centavos(base) });

  const incluidos = plan.includedMinutes * (ciclo === "anual" ? 12 : 1);
  const excedente = Math.max(0, minutosFranquia(uso) - incluidos);
  if (excedente > 0 && plan.overageBrl)
    itens.push({
      descricao: "Minutos excedentes",
      quantidade: excedente,
      unitarioCentavos: centavos(plan.overageBrl),
      totalCentavos: excedente * centavos(plan.overageBrl),
    });
  if (uso.minutosPico > 0 && plan.overageBrl)
    itens.push({
      descricao: "Minutos em pico (acima das chamadas simultâneas)",
      quantidade: uso.minutosPico,
      unitarioCentavos: centavos(plan.overageBrl * 2),
      totalCentavos: uso.minutosPico * centavos(plan.overageBrl * 2),
    });
  if (creditoProRataBrl > 0)
    itens.push({
      descricao: "Crédito proporcional da troca de plano",
      quantidade: 1,
      unitarioCentavos: -centavos(creditoProRataBrl),
      totalCentavos: -centavos(creditoProRataBrl),
    });
  return itens;
}

export function totalCentavos(itens: ItemFatura[]): number {
  return Math.max(0, itens.reduce((s, i) => s + i.totalCentavos, 0));
}

/** Unused share of the current cycle's price, credited when upgrading mid-cycle. */
export function creditoProRata(plan: Plan, ciclo: "mensal" | "anual", inicio: Date, fim: Date, agora: Date): number {
  const total = fim.getTime() - inicio.getTime();
  const restante = Math.max(0, fim.getTime() - agora.getTime());
  return Math.round(precoCiclo(plan, ciclo) * (restante / total) * 100) / 100;
}

export type EstadoFranquia = "ok" | "alerta_80" | "esgotada" | "teto";

/**
 * What the platform should do for the next call, given usage so far.
 * - trial: hard stop at the allowance (no overage on trial)
 * - teto: projected bill reached the customer's cap → agent goes to message-only mode
 */
export function estadoFranquia(planoId: PlanId, ciclo: "mensal" | "anual", uso: UsoCiclo, tetoBrl: number | null): EstadoFranquia {
  const plan = getPlan(planoId);
  const incluidos = plan.includedMinutes * (ciclo === "anual" ? 12 : 1);
  const usados = minutosFranquia(uso);
  if (planoId === "teste" && usados >= incluidos) return "esgotada";
  if (tetoBrl != null) {
    const projetado = totalCentavos(itensFatura(planoId, ciclo, uso)) / 100;
    if (projetado >= tetoBrl) return "teto";
  }
  if (usados >= incluidos) return "esgotada";
  if (usados >= incluidos * 0.8) return "alerta_80";
  return "ok";
}

/**
 * Linear forecast of the cycle's minutes from the pace so far. The pace is measured over at
 * least 3 days, so a few calls on the first morning don't extrapolate to an absurd month.
 */
export function previsaoMinutos(usados: number, inicio: Date, fim: Date, agora: Date): number {
  const total = fim.getTime() - inicio.getTime();
  const decorrido = Math.min(total, Math.max(3 * 86_400_000, agora.getTime() - inicio.getTime()));
  return Math.max(usados, Math.round((usados / decorrido) * total));
}
