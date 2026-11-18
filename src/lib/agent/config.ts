import { z } from "zod";
import { workflowPadrao, workflowSchema } from "./workflow";

export const NICHOS = ["clinica", "imobiliaria", "restaurante"] as const;
export type Nicho = (typeof NICHOS)[number];

export const OBJETIVOS = {
  agendar: "Agendar, remarcar e cancelar horários",
  duvidas: "Tirar dúvidas sobre serviços, preços e horários",
  pedidos: "Receber pedidos e reservas",
  triagem: "Entender o motivo e direcionar para a pessoa certa",
  recados: "Passar o caso para a equipe com um relatório quando não puder resolver",
} as const;
export type Objetivo = keyof typeof OBJETIVOS;

const diaSchema = z.object({ aberto: z.boolean(), inicio: z.string(), fim: z.string() });

export const campoSchema = z.object({
  chave: z.string().regex(/^[a-z_]+$/),
  rotulo: z.string().min(1),
  tipo: z.enum(["texto", "telefone", "cpf", "email", "data"]),
  obrigatorio: z.boolean(),
});

export const webhookAcaoSchema = z.object({
  nome: z.string().regex(/^[a-z_]{3,40}$/),
  descricao: z.string().min(5),
  url: z.string().url(),
  parametros: z.array(z.object({ nome: z.string(), descricao: z.string(), obrigatorio: z.boolean() })),
});

export const agentConfigSchema = z.object({
  empresa: z.object({
    nome: z.string().min(1),
    nicho: z.enum(NICHOS),
    cidade: z.string().default(""),
    endereco: z.string().default(""),
    telefone: z.string().default(""),
    servicos: z.array(z.object({ nome: z.string(), preco: z.string().optional(), duracaoMin: z.number().optional() })),
    formasPagamento: z.array(z.string()),
    convenios: z.array(z.string()),
    observacoes: z.string().default(""),
  }),
  comportamento: z.object({
    nomeAgente: z.string().min(1),
    saudacao: z.string().min(1),
    objetivos: z.array(z.enum(Object.keys(OBJETIVOS) as [Objetivo, ...Objetivo[]])),
    fazer: z.array(z.string()),
    nuncaFazer: z.array(z.string()),
    quandoTransferir: z.array(z.string()),
    tom: z.enum(["formal", "equilibrado", "descontraido"]),
    instrucoesExtras: z.string().default(""),
  }),
  voz: z.object({
    vozId: z.string(),
    velocidade: z.number().min(0.85).max(1.2),
    ultra: z.boolean(),
    pronuncias: z.array(z.object({ termo: z.string(), falar: z.string() })),
  }),
  acoes: z.object({
    agendar: z.object({ ativo: z.boolean(), agenda: z.enum(["interna", "google"]), duracaoPadraoMin: z.number().int().min(10) }),
    transferir: z.object({ ativo: z.boolean(), numero: z.string(), somenteHorarioComercial: z.boolean() }),
    whatsapp: z.object({ ativo: z.boolean() }),
    /** Hand-off to the team with a structured report: the core of the product, always available. */
    repassar: z.object({ notificar: z.enum(["whatsapp", "email", "ambos"]) }).default({ notificar: "ambos" }),
    // legacy keys kept optional so older drafts still parse
    recado: z.object({ ativo: z.boolean() }).optional(),
    sinalizar: z.object({ ativo: z.boolean() }).optional(),
    webhooks: z.array(webhookAcaoSchema),
  }),
  horarios: z.object({
    semana: z.array(diaSchema).length(7), // 0 = domingo
    feriados: z.array(z.string()),
    foraDoHorario: z.enum(["recado", "atender"]),
  }),
  dados: z.object({ campos: z.array(campoSchema) }),
  seguranca: z.object({
    temasProibidos: z.array(z.string()),
    duracaoMaxMin: z.number().int().min(2).max(60),
    silencioEncerrarS: z.number().int().min(5).max(120),
    bloquearSpam: z.boolean(),
  }),
  modelo: z.enum(["padrao", "avancado"]),
  workflow: workflowSchema.default(workflowPadrao),
  widget: z.object({
    cor: z.string(),
    texto: z.string(),
    ativo: z.boolean().default(true),
    /** Sites allowed to embed the widget (hostnames). Empty = any site. */
    dominios: z.array(z.string()).default([]),
  }),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

/**
 * Disclosure every greeting must keep: that the caller is talking to a *virtual* receptionist and
 * that the call is recorded (provider terms + LGPD). Wording stays natural ("recepcionista virtual").
 */
export const AVISO_REGEX = /(virtual|intelig[êe]ncia artificial|\bIA\b)[\s\S]*(grava|gravad)|(grava|gravad)[\s\S]*(virtual|intelig[êe]ncia artificial|\bIA\b)/i;

export function saudacaoTemAviso(saudacao: string): boolean {
  return AVISO_REGEX.test(saudacao);
}

export const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function semanaComercial(inicio = "08:00", fim = "18:00", sabado: false | { inicio: string; fim: string } = false) {
  return DIAS.map((_, i) => {
    if (i === 0) return { aberto: false, inicio, fim };
    if (i === 6) return sabado ? { aberto: true, ...sabado } : { aberto: false, inicio, fim };
    return { aberto: true, inicio, fim };
  });
}
