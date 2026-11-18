import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AgentConfig } from "@/lib/agent/config";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const orgId = () => text("org_id").notNull();
const createdAt = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/* ───────────── Tenancy & auth ───────────── */

export const organizacoes = pgTable("organizacoes", {
  id: id(),
  nome: text("nome").notNull(),
  cnpj: text("cnpj"),
  nicho: text("nicho").notNull().default("clinica"),
  cidade: text("cidade"),
  fuso: text("fuso").notNull().default("America/Sao_Paulo"),
  telefoneContato: text("telefone_contato"),
  retencaoAudioDias: integer("retencao_audio_dias").notNull().default(90),
  retencaoTranscricaoDias: integer("retencao_transcricao_dias").notNull().default(365),
  mascararDados: boolean("mascarar_dados").notNull().default(true),
  onboardingPasso: integer("onboarding_passo").notNull().default(1),
  onboardingConcluido: boolean("onboarding_concluido").notNull().default(false),
  asaasClienteId: text("asaas_cliente_id"),
  criadoEm: createdAt(),
});

export const usuarios = pgTable(
  "usuarios",
  {
    id: id(),
    email: text("email").notNull(),
    nome: text("nome").notNull(),
    senhaHash: text("senha_hash").notNull(),
    staff: boolean("staff").notNull().default(false),
    criadoEm: createdAt(),
  },
  (t) => [uniqueIndex("usuarios_email_uq").on(t.email)],
);

export type Papel = "dono" | "gestor" | "atendente" | "financeiro";

export const membros = pgTable(
  "membros",
  {
    orgId: orgId(),
    usuarioId: text("usuario_id").notNull(),
    papel: text("papel").$type<Papel>().notNull(),
    criadoEm: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.usuarioId] })],
);

export const sessoes = pgTable("sessoes", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  usuarioId: text("usuario_id").notNull(),
  orgId: text("org_id"),
  expiraEm: ts("expira_em").notNull(),
  criadoEm: createdAt(),
});

export const convites = pgTable("convites", {
  id: text("id").primaryKey(), // sha256 of the invite token
  orgId: orgId(),
  email: text("email").notNull(),
  papel: text("papel").$type<Papel>().notNull(),
  expiraEm: ts("expira_em").notNull(),
  aceitoEm: ts("aceito_em"),
  criadoEm: createdAt(),
});

export const auditoria = pgTable("auditoria", {
  id: id(),
  orgId: orgId(),
  usuarioId: text("usuario_id"),
  acao: text("acao").notNull(),
  detalhes: jsonb("detalhes"),
  criadoEm: createdAt(),
});

/* ───────────── Agents ───────────── */

export const agentes = pgTable(
  "agentes",
  {
    id: id(),
    orgId: orgId(),
    nome: text("nome").notNull(),
    nicho: text("nicho").notNull(),
    status: text("status").$type<"rascunho" | "publicado" | "pausado">().notNull().default("rascunho"),
    rascunho: jsonb("rascunho").$type<AgentConfig>().notNull(),
    versaoPublicadaId: text("versao_publicada_id"),
    rascunhoAlteradoEm: ts("rascunho_alterado_em").notNull().defaultNow(),
    criadoEm: createdAt(),
  },
  (t) => [index("agentes_org_idx").on(t.orgId)],
);

export const agenteVersoes = pgTable(
  "agente_versoes",
  {
    id: id(),
    orgId: orgId(),
    agenteId: text("agente_id").notNull(),
    numero: integer("numero").notNull(),
    config: jsonb("config").$type<AgentConfig>().notNull(),
    prompt: text("prompt").notNull(),
    nota: text("nota"),
    autorId: text("autor_id"),
    forcada: boolean("forcada").notNull().default(false),
    resultadoTestes: jsonb("resultado_testes"),
    criadoEm: createdAt(),
  },
  (t) => [uniqueIndex("agente_versoes_num_uq").on(t.agenteId, t.numero)],
);

export const fontesConhecimento = pgTable("fontes_conhecimento", {
  id: id(),
  orgId: orgId(),
  agenteId: text("agente_id").notNull(),
  tipo: text("tipo").$type<"site" | "pdf" | "texto" | "faq">().notNull(),
  titulo: text("titulo").notNull(),
  url: text("url"),
  status: text("status").$type<"pendente" | "indexando" | "pronto" | "erro">().notNull().default("pendente"),
  erro: text("erro"),
  paginas: integer("paginas").notNull().default(0),
  atualizadoEm: ts("atualizado_em").notNull().defaultNow(),
  criadoEm: createdAt(),
});

export const trechos = pgTable(
  "trechos",
  {
    id: id(),
    orgId: orgId(),
    agenteId: text("agente_id").notNull(),
    fonteId: text("fonte_id").notNull(),
    origem: text("origem"),
    texto: text("texto").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('portuguese', texto)`),
  },
  (t) => [index("trechos_tsv_idx").using("gin", t.tsv), index("trechos_agente_idx").on(t.agenteId)],
);

/* ───────────── Conversations ───────────── */

export interface UsoConversa {
  llmModelo: string;
  llmInput: number;
  llmCached: number;
  llmOutput: number;
  posInput: number;
  posOutput: number;
  ttsChars: number;
  ttsTier: "padrao" | "ultra";
  sttSegundos: number;
  telefoniaSegundos: number;
}

export type Canal ="teste_texto" | "teste_voz" | "simulador" | "telefone" | "whatsapp" | "widget" | "simulacao";
export type Resultado = "resolvido" | "repassado" | "transferido" | "recado" | "nao_resolvido";

export const conversas = pgTable(
  "conversas",
  {
    id: id(),
    orgId: orgId(),
    agenteId: text("agente_id").notNull(),
    versaoId: text("versao_id"), // null = rascunho (testes)
    canal: text("canal").$type<Canal>().notNull(),
    teste: boolean("teste").notNull().default(false),
    de: text("de"),
    status: text("status").$type<"em_andamento" | "encerrada">().notNull().default("em_andamento"),
    resultado: text("resultado").$type<Resultado>(),
    resumo: text("resumo"),
    motivo: text("motivo"),
    dados: jsonb("dados").$type<Record<string, string>>(),
    avaliacao: jsonb("avaliacao").$type<{ sucesso: boolean; justificativa: string }>(),
    sentimento: text("sentimento").$type<"positivo" | "neutro" | "negativo">(),
    sinalizada: boolean("sinalizada").notNull().default(false),
    pico: boolean("pico").notNull().default(false),
    modoRecado: boolean("modo_recado").notNull().default(false),
    audioChave: text("audio_chave"), // recording key in storage (null = no recording / expired)
    audioPicos: jsonb("audio_picos").$type<number[]>(),
    duracaoS: integer("duracao_s").notNull().default(0),
    minutosCobrados: integer("minutos_cobrados").notNull().default(0),
    /** LLM message history (Anthropic MessageParam[]) so a conversation survives across requests. */
    estado: jsonb("estado").$type<{ mensagens: unknown[]; transferirPara?: string; mockAgenda?: string; modelo?: string; no?: string | null; vars?: Record<string, string>; agenteAtivo?: string }>(),
    /** Metered usage, turned into cost at hang-up. */
    uso: jsonb("uso").$type<UsoConversa>(),
    iniciadaEm: ts("iniciada_em").notNull().defaultNow(),
    encerradaEm: ts("encerrada_em"),
  },
  (t) => [index("conversas_org_idx").on(t.orgId, t.iniciadaEm), index("conversas_agente_idx").on(t.agenteId)],
);

export const turnos = pgTable(
  "turnos",
  {
    id: id(),
    orgId: orgId(),
    conversaId: text("conversa_id").notNull(),
    ordem: integer("ordem").notNull(),
    papel: text("papel").$type<"agente" | "cliente" | "sistema">().notNull(),
    texto: text("texto").notNull(),
    offsetMs: integer("offset_ms").notNull().default(0),
    criadoEm: createdAt(),
  },
  (t) => [index("turnos_conversa_idx").on(t.conversaId, t.ordem)],
);

export const chamadasFerramenta = pgTable("chamadas_ferramenta", {
  id: id(),
  orgId: orgId(),
  conversaId: text("conversa_id").notNull(),
  nome: text("nome").notNull(),
  args: jsonb("args"),
  resultado: jsonb("resultado"),
  erro: text("erro"),
  criadoEm: createdAt(),
});

export const registroCusto = pgTable(
  "registro_custo",
  {
    id: id(),
    orgId: orgId(),
    conversaId: text("conversa_id"),
    tipo: text("tipo").$type<"chamada" | "teste" | "simulacao" | "previa" | "crawl">().notNull(),
    detalhes: jsonb("detalhes"),
    custoUsd: doublePrecision("custo_usd").notNull(),
    custoBrl: doublePrecision("custo_brl").notNull(),
    criadoEm: createdAt(),
  },
  (t) => [index("registro_custo_org_idx").on(t.orgId, t.criadoEm)],
);

export const chamadasAtivas = pgTable("chamadas_ativas", {
  conversaId: text("conversa_id").primaryKey(),
  orgId: orgId(),
  pico: boolean("pico").notNull().default(false),
  iniciadaEm: ts("iniciada_em").notNull().defaultNow(),
});

/* ───────────── Business tools ───────────── */

export const agendaEventos = pgTable("agenda_eventos", {
  id: id(),
  orgId: orgId(),
  agenteId: text("agente_id"),
  inicio: ts("inicio").notNull(),
  fim: ts("fim").notNull(),
  titulo: text("titulo").notNull(),
  clienteNome: text("cliente_nome"),
  clienteTelefone: text("cliente_telefone"),
  conversaId: text("conversa_id"),
  simulado: boolean("simulado").notNull().default(false),
  status: text("status").$type<"confirmado" | "cancelado">().notNull().default("confirmado"),
  criadoEm: createdAt(),
});

/** A/B experiment: a share of new calls runs version B instead of the published one (Business plan). */
export const experimentos = pgTable(
  "experimentos",
  {
    id: id(),
    orgId: orgId(),
    agenteId: text("agente_id").notNull(),
    versaoA: text("versao_a").notNull(),
    versaoB: text("versao_b").notNull(),
    percentualB: integer("percentual_b").notNull().default(50),
    status: text("status").$type<"ativo" | "encerrado">().notNull().default("ativo"),
    vencedora: text("vencedora"),
    criadoEm: createdAt(),
    encerradoEm: ts("encerrado_em"),
  },
  (t) => [index("experimentos_agente_idx").on(t.agenteId, t.status)],
);

/** Hand-off to the team: the receptionist's structured report when it is not sure (inbox / triage). */
export const repasses = pgTable(
  "repasses",
  {
    id: id(),
    orgId: orgId(),
    agenteId: text("agente_id"),
    conversaId: text("conversa_id"),
    titulo: text("titulo").notNull(),
    motivo: text("motivo").notNull(),
    pedido: text("pedido").notNull(), // what the customer wants
    urgencia: text("urgencia").$type<"baixa" | "media" | "alta">().notNull().default("media"),
    proximoPasso: text("proximo_passo"),
    contatoNome: text("contato_nome"),
    contatoTelefone: text("contato_telefone"),
    dados: jsonb("dados").$type<Record<string, string>>(),
    trecho: text("trecho"),
    origem: text("origem").$type<"agente" | "automatico" | "teste" | "manual">().notNull().default("agente"),
    status: text("status").$type<"pendente" | "em_andamento" | "resolvido">().notNull().default("pendente"),
    responsavelId: text("responsavel_id"),
    nota: text("nota"),
    resolvidoEm: ts("resolvido_em"),
    criadoEm: createdAt(),
  },
  (t) => [index("repasses_org_idx").on(t.orgId, t.status, t.criadoEm)],
);

export const recados = pgTable("recados", {
  id: id(),
  orgId: orgId(),
  conversaId: text("conversa_id"),
  nome: text("nome"),
  telefone: text("telefone"),
  mensagem: text("mensagem").notNull(),
  lido: boolean("lido").notNull().default(false),
  criadoEm: createdAt(),
});

export const caixaSaida = pgTable("caixa_saida", {
  id: id(),
  orgId: orgId(),
  canal: text("canal").$type<"whatsapp" | "email">().notNull(),
  destino: text("destino").notNull(),
  assunto: text("assunto"),
  corpo: text("corpo").notNull(),
  status: text("status").$type<"simulado" | "enviado" | "erro">().notNull().default("simulado"),
  criadoEm: createdAt(),
});

export const numeros = pgTable("numeros", {
  id: id(),
  orgId: orgId(),
  agenteId: text("agente_id"),
  e164: text("e164").notNull(),
  tipo: text("tipo").$type<"desvio" | "proprio" | "simulado">().notNull(),
  operadora: text("operadora"),
  desvioDe: text("desvio_de"),
  modoDesvio: text("modo_desvio"),
  verificadoEm: ts("verificado_em"),
  provedorSid: text("provedor_sid"),
  criadoEm: createdAt(),
});

export const integracoes = pgTable("integracoes", {
  id: id(),
  orgId: orgId(),
  tipo: text("tipo").notNull(), // connector id (src/lib/integracoes/catalogo.ts)
  status: text("status").$type<"conectado" | "erro" | "desconectado">().notNull(),
  credenciais: text("credenciais"), // encrypted (AES-GCM)
  detalhes: jsonb("detalhes"),
  atualizadoEm: ts("atualizado_em").notNull().defaultNow(),
});

/* ───────────── Testing ───────────── */

export type Severidade = "critico" | "importante" | "informativo";

export const casosTeste = pgTable("casos_teste", {
  id: id(),
  orgId: orgId(),
  agenteId: text("agente_id").notNull(),
  tipo: text("tipo").$type<"simulacao" | "proxima_resposta" | "chamada_acao">().notNull(),
  nome: text("nome").notNull(),
  severidade: text("severidade").$type<Severidade>().notNull().default("importante"),
  config: jsonb("config").notNull(),
  origemConversaId: text("origem_conversa_id"),
  criadoEm: createdAt(),
});

export const execucoesTeste = pgTable("execucoes_teste", {
  id: id(),
  orgId: orgId(),
  casoId: text("caso_id").notNull(),
  agenteId: text("agente_id").notNull(),
  alvo: text("alvo").notNull(), // "rascunho" | versao id
  rodadas: integer("rodadas").notNull(),
  aprovadas: integer("aprovadas").notNull().default(0),
  status: text("status").$type<"pendente" | "rodando" | "concluida" | "erro">().notNull().default("pendente"),
  detalhes: jsonb("detalhes"),
  criadoEm: createdAt(),
});

/* ───────────── Billing ───────────── */

export const assinaturas = pgTable(
  "assinaturas",
  {
    id: id(),
    orgId: orgId(),
    planoId: text("plano_id").notNull(),
    ciclo: text("ciclo").$type<"mensal" | "anual">().notNull().default("mensal"),
    status: text("status").$type<"trial" | "ativa" | "inadimplente" | "suspensa" | "cancelada">().notNull(),
    inicioCiclo: ts("inicio_ciclo").notNull(),
    fimCiclo: ts("fim_ciclo").notNull(),
    trialFim: ts("trial_fim"),
    tetoBrl: doublePrecision("teto_brl"),
    picoHabilitado: boolean("pico_habilitado").notNull().default(false),
    asaasAssinaturaId: text("asaas_assinatura_id"),
    criadoEm: createdAt(),
  },
  (t) => [uniqueIndex("assinaturas_org_uq").on(t.orgId)],
);

export const faturas = pgTable("faturas", {
  id: id(),
  orgId: orgId(),
  cicloInicio: ts("ciclo_inicio").notNull(),
  cicloFim: ts("ciclo_fim").notNull(),
  itens: jsonb("itens").$type<{ descricao: string; quantidade: number; unitarioCentavos: number; totalCentavos: number }[]>().notNull(),
  totalCentavos: integer("total_centavos").notNull(),
  status: text("status").$type<"aberta" | "paga" | "vencida" | "cancelada">().notNull().default("aberta"),
  vencimento: ts("vencimento").notNull(),
  pagoEm: ts("pago_em"),
  asaasCobrancaId: text("asaas_cobranca_id"),
  linkPagamento: text("link_pagamento"),
  pixCopiaCola: text("pix_copia_cola"),
  criadoEm: createdAt(),
});

export const alertas = pgTable(
  "alertas",
  {
    id: id(),
    orgId: orgId(),
    tipo: text("tipo").notNull(), // franquia_80 | franquia_100 | teto | inadimplencia | margem
    cicloInicio: ts("ciclo_inicio"),
    mensagem: text("mensagem").notNull(),
    lido: boolean("lido").notNull().default(false),
    criadoEm: createdAt(),
  },
  (t) => [uniqueIndex("alertas_unico_uq").on(t.orgId, t.tipo, t.cicloInicio)],
);

/* ───────────── Developer surface ───────────── */

export const chavesApi = pgTable("chaves_api", {
  id: id(),
  orgId: orgId(),
  nome: text("nome").notNull(),
  prefixo: text("prefixo").notNull(),
  hash: text("hash").notNull(),
  ultimoUso: ts("ultimo_uso"),
  revogadaEm: ts("revogada_em"),
  criadoEm: createdAt(),
});

export const webhooks = pgTable("webhooks", {
  id: id(),
  orgId: orgId(),
  url: text("url").notNull(),
  eventos: jsonb("eventos").$type<string[]>().notNull(),
  segredo: text("segredo").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: createdAt(),
});

export const entregasWebhook = pgTable("entregas_webhook", {
  id: id(),
  orgId: orgId(),
  webhookId: text("webhook_id").notNull(),
  evento: text("evento").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").$type<"pendente" | "entregue" | "falhou">().notNull().default("pendente"),
  tentativas: integer("tentativas").notNull().default(0),
  respostaStatus: integer("resposta_status"),
  criadoEm: createdAt(),
});

/* ───────────── Jobs ───────────── */

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").$type<"pendente" | "rodando" | "concluido" | "erro">().notNull().default("pendente"),
    tentativas: integer("tentativas").notNull().default(0),
    executarEm: ts("executar_em").notNull().defaultNow(),
    erro: text("erro"),
    criadoEm: createdAt(),
  },
  (t) => [index("jobs_fila_idx").on(t.status, t.executarEm)],
);
