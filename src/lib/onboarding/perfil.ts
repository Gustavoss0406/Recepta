/**
 * What the onboarding conversation learns about the business. Flat string fields (normalized by
 * the local parser and/or the model) plus free-form rules ("quando X, faça Y").
 */
export type Categoria = "imobiliaria" | "clinica" | "restaurante" | "servicos";

export interface RegraLivre {
  quando: string;
  fazer: string;
}

export interface Perfil {
  campos: Record<string, string>;
  regras: RegraLivre[];
  /** Questions the owner skipped (defaults are used, never asked again). */
  pulados: string[];
}

export const perfilVazio = (): Perfil => ({ campos: {}, regras: [], pulados: [] });

export const norm = (x: string) =>
  x
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Every field the conversation can fill, with what it means (also given to the model). */
export const CAMPOS: Record<string, string> = {
  segmento: "tipo de negócio em poucas palavras (ex.: imobiliária, clínica odontológica, oficina mecânica)",
  categoria: "uma de: imobiliaria, clinica, restaurante, servicos",
  empresa_nome: "nome da empresa",
  cidade: "cidade (e estado se disser)",
  servicos: "principais serviços/produtos separados por ';' (com preço se disser, ex.: 'Limpeza - R$ 150')",
  motivos: "motivos mais comuns das ligações separados por ';'",
  horario: "horário de funcionamento como o dono falou (ex.: 'seg a sex 8h às 18h, sáb 8h às 12h')",
  agenda: "sim ou nao: se a empresa marca horários/visitas/reservas",
  fora: "o que fazer fora do horário: marcar, recado ou plantao",
  plantao_numero: "telefone de plantão para urgências fora do horário",
  pessoa: "quando pedem para falar com alguém: transferir ou recado",
  transferir_numero: "telefone para transferir ligações",
  site: "endereço do site, ou nao",
  instagram: "perfil do Instagram (@usuario), se disser",
  recep_nome: "nome da recepcionista virtual",
  tom: "formal, equilibrado ou descontraido",
  operacao: "imobiliária: venda, locacao ou ambos",
  regioes: "bairros/regiões atendidos separados por ';'",
  alto_valor: "imobiliária: valor em reais a partir do qual o imóvel é alto padrão (só número, ex.: 1500000)",
  alto_acao: "o que fazer com cliente de alto padrão (ex.: passar para o corretor sênior)",
  financiamento: "explica ou repassa (financiamento/FGTS)",
  visita_requisitos: "o que precisa para visitar um imóvel",
  captacao: "sim ou nao: aceita proprietários anunciando imóveis",
  inquilino: "como tratar inquilino com problema (manutenção, boleto)",
  especialidades: "especialidades/profissionais separados por ';'",
  convenios: "convênios aceitos separados por ';', ou nao",
  urgencia_orientacao: "o que falar em caso de sintoma grave/urgência",
  retorno: "regra de retorno (prazo/custo)",
  receitas: "como tratar pedidos de receita, atestado ou resultado de exame",
  reserva_max: "restaurante: máximo de pessoas por reserva (número) ou nao (não aceita reserva)",
  tolerancia: "tolerância de atraso da reserva em minutos",
  delivery: "como funciona delivery/retirada, ou nao",
  eventos: "como tratar grupos grandes/eventos",
  alergias: "responde sobre alergias ou consulta a cozinha",
  orcamento: "telefone (passa orçamento por telefone) ou visita",
  atende_local: "vai até o cliente ou o cliente vem; área de atendimento",
  urgencia_srv: "o que é urgente no ramo e o que fazer",
  garantia: "regra de pós-venda/garantia",
  vip: "como tratar clientes recorrentes/VIP, ou nao",
  reclamacao: "quem resolve reclamações e em quanto tempo retorna",
  cancelamento: "regra de cancelamento/falta",
  desconto: "nao, ou até quanto pode negociar (ex.: 10%)",
  confirmacao: "sim ou nao: confirmar e lembrar horários por WhatsApp",
  sistemas: "sistemas/CRM usados, ou nao",
  aviso: "whatsapp, email ou ambos",
  nunca: "o que nunca falar ou prometer, separado por ';'",
  vendedores: "sim (dispensar vendedores/telemarketing) ou nao",
  extra_fim: "sim quando o dono disser que não tem mais situações específicas",
};

export const lista = (v: string | undefined) =>
  (v ?? "")
    .split(/[;\n]|,(?![^(]*\))/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(nao|não|nenhum|nenhuma)$/i.test(x))
    .slice(0, 8);

export const ehNao = (v: string | undefined) => !v || /^(nao|não|n|nenhum|nenhuma|nada|nunca)\b/i.test(v.trim());
export const ehSim = (v: string | undefined) => !!v && /^(sim|s|claro|isso|com certeza|pode|quero|aceit|marc|faz)/i.test(norm(v));

/** "1,5 mi", "2 milhões", "800 mil", "R$ 1.200.000" → reais. */
export function valorEmReais(t: string): number | null {
  const s = norm(t).replace(/r\$\s*/g, "");
  const m = /(\d+(?:[.,]\d+)*)\s*(milhoes|milhao|mi|kk|mil|k)?\b/.exec(s);
  if (!m) return null;
  let num = m[1];
  const mult = !m[2] ? 1 : m[2] === "mil" || m[2] === "k" ? 1_000 : 1_000_000;
  if (mult > 1) num = num.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  else num = num.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");
  const v = Number(num) * mult;
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

export function telefone(t: string): string | null {
  const m = /(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/.exec(t);
  return m ? m[0].replace(/[^\d+]/g, "") : null;
}

export const brl = (v: number) => (v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : `R$ ${v.toLocaleString("pt-BR")}`);

/** Business hours from free text ("seg a sex 8h às 18h, sábado 8 às 12"). Days 0..6 (domingo = 0). */
export function lerHorario(t: string): { aberto: boolean; inicio: string; fim: string }[] {
  const s = norm(t);
  const hh = (h: string) => `${h.padStart(2, "0").slice(-2)}:00`;
  const faixa = (x: string) => {
    const m = /(\d{1,2})\s*(?:h|:00)?\s*(?:as|a|ate|-|–)\s*(\d{1,2})/.exec(x);
    return m ? { inicio: hh(m[1]), fim: hh(m[2]) } : null;
  };
  const partes = s.split(/[,;]| e (?=sab|dom)/);
  const semana = faixa(partes[0]) ?? faixa(s) ?? { inicio: "08:00", fim: "18:00" };
  const sabParte = partes.find((p) => /sab/.test(p));
  const sab = sabParte ? (faixa(sabParte) ?? semana) : null;
  const domParte = partes.find((p) => /dom/.test(p));
  const todos = /todos os dias|24h|24 horas/.test(s);
  if (/24h|24 horas/.test(s)) return Array.from({ length: 7 }, () => ({ aberto: true, inicio: "00:00", fim: "23:59" }));
  return Array.from({ length: 7 }, (_, i) => {
    if (i === 0) return domParte || todos ? { aberto: true, ...(domParte ? (faixa(domParte) ?? semana) : semana) } : { aberto: false, ...semana };
    if (i === 6) return sab || todos ? { aberto: true, ...(sab ?? semana) } : { aberto: false, ...semana };
    return { aberto: true, ...semana };
  });
}
