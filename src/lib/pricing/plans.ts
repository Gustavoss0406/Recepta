export type PlanId = "teste" | "start" | "pro" | "business" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in BRL; null = sob consulta. */
  priceBrl: number | null;
  includedMinutes: number;
  /** Price per minute beyond the allowance; null = not sold. */
  overageBrl: number | null;
  concurrency: number | null;
  agents: number | null;
  numbers: number;
  seats: number | null;
  /** Fixed monthly cost to serve the account (numbers + per-account infra), BRL. */
  fixedCostBrl: number;
  blurb: string;
  features: string[];
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "teste",
    name: "Teste grátis",
    priceBrl: 0,
    includedMinutes: 30,
    overageBrl: null,
    concurrency: 1,
    agents: 1,
    numbers: 0,
    seats: 1,
    fixedCostBrl: 0,
    blurb: "7 dias para ouvir seu agente atendendo.",
    features: ["30 minutos de teste", "Chamada pelo navegador", "1 agente", "Base de conhecimento pela URL do site"],
  },
  {
    id: "start",
    name: "Start",
    priceBrl: 197,
    includedMinutes: 200,
    overageBrl: 0.99,
    concurrency: 2,
    agents: 1,
    numbers: 1,
    seats: 2,
    fixedCostBrl: 35,
    blurb: "Para o pequeno negócio que não pode perder ligação.",
    features: [
      "200 minutos/mês",
      "1 número local ou desvio do seu número",
      "2 chamadas simultâneas",
      "Resumo de cada ligação no WhatsApp",
      "Vozes brasileiras exclusivas",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceBrl: 497,
    includedMinutes: 600,
    overageBrl: 0.89,
    concurrency: 5,
    agents: 3,
    numbers: 1,
    seats: 5,
    fixedCostBrl: 40,
    blurb: "Agendamentos, integrações e fluxos sob medida.",
    featured: true,
    features: [
      "600 minutos/mês",
      "3 agentes e 5 chamadas simultâneas",
      "Agenda, CRM e WhatsApp integrados",
      "Editor de fluxos visual",
      "Analytics e testes simulados",
    ],
  },
  {
    id: "business",
    name: "Business",
    priceBrl: 1290,
    includedMinutes: 1800,
    overageBrl: 0.79,
    concurrency: 15,
    agents: 10,
    numbers: 2,
    seats: 10,
    fixedCostBrl: 80,
    blurb: "Para operações com volume e várias unidades.",
    features: [
      "1.800 minutos/mês",
      "10 agentes e 15 chamadas simultâneas",
      "2 números inclusos",
      "Testes A/B de agentes",
      "API e webhooks",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceBrl: null,
    includedMinutes: 10_000,
    overageBrl: null,
    concurrency: null,
    agents: null,
    numbers: 5,
    seats: null,
    fixedCostBrl: 0,
    blurb: "Volume, SLA e conformidade sob contrato.",
    features: [
      "A partir de 10 mil minutos",
      "R$ 0,49–0,62 por minuto",
      "SLA, SSO e DPA dedicado",
      "Voz clonada profissional",
      "Gerente de conta",
    ],
  },
];

export const ENTERPRISE_FLOOR_BRL_PER_MIN = { phase2: 0.62, phase4: 0.49 } as const;

export const ADDONS = [
  { id: "numero", name: "Número extra", priceLabel: "R$ 39/mês", costBrlMonthly: 4.25 * 5.5 },
  { id: "avancado", name: "Modo avançado (raciocínio superior)", priceLabel: "+R$ 0,20/min", costBrlPerMin: 0.08 },
  { id: "ultra", name: "Voz Ultra (fidelidade máxima)", priceLabel: "+R$ 0,20/min", costBrlPerMin: 0.1 },
  { id: "clone", name: "Clone da sua voz", priceLabel: "R$ 99/mês" },
  { id: "whatsapp", name: "Mensagens WhatsApp", priceLabel: "Tarifa Meta +20%" },
] as const;

export function getPlan(id: PlanId): Plan {
  const p = PLANS.find((x) => x.id === id);
  if (!p) throw new Error(`Plano desconhecido: ${id}`);
  return p;
}
