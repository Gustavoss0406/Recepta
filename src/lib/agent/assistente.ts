import { z } from "zod";
import { agentConfigSchema, DIAS, OBJETIVOS, saudacaoTemAviso, type AgentConfig, type Objetivo } from "./config";

/**
 * Configuration assistant: the business describes itself (or asks for a change) in plain words, a
 * language model proposes changes per section, and the business approves section by section.
 * This file is pure: schema of a proposal, safety guards and the before/after for review.
 */

const lista = z.array(z.string()).max(20);

export const propostaSchema = z.object({
  resumo: z.string().describe("Uma frase, em português, dizendo o que você propõe"),
  empresa: z
    .object({
      nome: z.string(),
      cidade: z.string(),
      endereco: z.string(),
      telefone: z.string(),
      servicos: z.array(z.object({ nome: z.string(), preco: z.string().optional(), duracaoMin: z.number().optional() })).max(30).describe("Lista completa de serviços citados pelo dono"),
      formasPagamento: lista,
      convenios: lista,
      observacoes: z.string(),
    })
    .partial()
    .optional()
    .describe("Só os campos da empresa que mudam"),
  saudacao: z.string().optional().describe("Saudação completa; precisa dizer 'recepcionista virtual' e que 'a ligação é gravada'"),
  nomeAgente: z.string().optional(),
  tom: z.enum(["formal", "equilibrado", "descontraido"]).optional(),
  objetivos: z.array(z.enum(Object.keys(OBJETIVOS) as [Objetivo, ...Objetivo[]])).optional(),
  regrasAdicionar: z
    .array(z.object({ tipo: z.enum(["sempre", "nunca", "passar_para_equipe"]), texto: z.string() }))
    .max(15)
    .optional()
    .describe("Regras NOVAS. sempre = algo que ela sempre faz; nunca = algo proibido; passar_para_equipe = situação em que ela passa o caso para o dono/equipe"),
  regrasRemover: z.array(z.string()).max(15).optional().describe("Texto exato de regras atuais que devem sair"),
  dadosAdicionar: z
    .array(z.object({ rotulo: z.string(), tipo: z.enum(["texto", "telefone", "cpf", "email", "data"]), obrigatorio: z.boolean() }))
    .max(12)
    .optional()
    .describe("Dados NOVOS que ela passa a pedir"),
  dadosRemover: z.array(z.string()).max(12).optional().describe("Rótulos de dados atuais que ela deixa de pedir"),
  horarios: z
    .object({
      dias: z.array(z.object({ dia: z.number().int().min(0).max(6).describe("0 = domingo"), aberto: z.boolean(), inicio: z.string(), fim: z.string() })),
      foraDoHorario: z.enum(["recado", "atender"]).optional(),
    })
    .optional(),
  agendar: z.boolean().optional().describe("Se ela agenda horários"),
  transferirPara: z.string().optional().describe("Telefone para transferir ligações, se informado"),
});
export type Proposta = z.infer<typeof propostaSchema>;

export type IdSecao = "empresa" | "saudacao" | "objetivos" | "regras" | "dados" | "horarios" | "acoes";

export interface Secao {
  id: IdSecao;
  titulo: string;
  antes: string[];
  depois: string[];
  /** Why a proposed change was held back (safety rules). */
  aviso?: string;
}

const SECOES: Record<IdSecao, string> = {
  empresa: "Sobre a empresa",
  saudacao: "Saudação e jeito de falar",
  objetivos: "O que ela faz",
  regras: "Regras e quando passar para a equipe",
  dados: "Dados que ela coleta",
  horarios: "Horário de atendimento",
  acoes: "Agendamento e transferência",
};

/** Instructions that would make the receptionist pretend to be human or hide the recording are dropped. */
const PROIBIDO = /(diga|dizer|finja|fingir|afirme|afirmar|se passe|passar-se)[^.]{0,40}(human[ao]|pessoa de verdade|pessoa real|não (é|sou) (virtual|rob[ôo]))|n[ãa]o (avis|diga|fale|mencion)[^.]{0,30}(grava|virtual)/i;
const seguro = (itens: string[]) => itens.map((i) => i.trim()).filter((i) => i && !PROIBIDO.test(i));

const chave = (rotulo: string) =>
  rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "campo";

const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const hora = (h: string, padrao: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(h) ? h : padrao);

function linhasEmpresa(e: AgentConfig["empresa"]) {
  return [
    `Nome: ${e.nome}`,
    e.cidade && `Cidade: ${e.cidade}`,
    e.endereco && `Endereço: ${e.endereco}`,
    e.telefone && `Telefone: ${e.telefone}`,
    e.servicos.length && `Serviços: ${e.servicos.map((s) => (s.preco ? `${s.nome} (${s.preco})` : s.nome)).join(", ")}`,
    e.formasPagamento.length && `Pagamento: ${e.formasPagamento.join(", ")}`,
    e.convenios.length && `Convênios: ${e.convenios.join(", ")}`,
    e.observacoes && `Observações: ${e.observacoes}`,
  ].filter(Boolean) as string[];
}

const TOM = { formal: "formal", equilibrado: "equilibrado", descontraido: "descontraído" };

const linhas: Record<IdSecao, (c: AgentConfig) => string[]> = {
  empresa: (c) => linhasEmpresa(c.empresa),
  saudacao: (c) => [`“${c.comportamento.saudacao}”`, `Nome: ${c.comportamento.nomeAgente} · Tom ${TOM[c.comportamento.tom]}`],
  objetivos: (c) => c.comportamento.objetivos.map((o) => OBJETIVOS[o]),
  regras: (c) => [
    ...c.comportamento.fazer.map((f) => `Sempre: ${f}`),
    ...c.comportamento.nuncaFazer.map((f) => `Nunca: ${f}`),
    ...c.comportamento.quandoTransferir.map((f) => `Passa para a equipe: ${f}`),
  ],
  dados: (c) => c.dados.campos.map((f) => `${f.rotulo}${f.obrigatorio ? " (obrigatório)" : ""}`),
  horarios: (c) => [
    ...c.horarios.semana.map((d, i) => `${DIAS[i]}: ${d.aberto ? `${d.inicio}–${d.fim}` : "fechado"}`),
    `Fora do horário: ${c.horarios.foraDoHorario === "recado" ? "passa o caso para a equipe" : "atende normalmente"}`,
  ],
  acoes: (c) => [
    `Agendamento: ${c.acoes.agendar.ativo ? "ligado" : "desligado"}`,
    `Transferência: ${c.acoes.transferir.ativo && c.acoes.transferir.numero ? c.acoes.transferir.numero : "desligada"}`,
  ],
};

/**
 * Applies a proposal to a config. Returns the new config (always valid) and the sections that
 * actually changed, with before/after lines. `somente` limits which sections are applied.
 */
export function aplicarProposta(atual: AgentConfig, p: Proposta, somente?: IdSecao[]): { config: AgentConfig; secoes: Secao[] } {
  const usar = (id: IdSecao) => !somente || somente.includes(id);
  const c: AgentConfig = structuredClone(atual);
  const avisos: Partial<Record<IdSecao, string>> = {};

  if (usar("empresa") && p.empresa) {
    const e = p.empresa;
    c.empresa = {
      ...c.empresa,
      ...(e.nome?.trim() ? { nome: e.nome.trim() } : {}),
      ...(e.cidade !== undefined ? { cidade: e.cidade.trim() } : {}),
      ...(e.endereco !== undefined ? { endereco: e.endereco.trim() } : {}),
      ...(e.telefone !== undefined ? { telefone: e.telefone.trim() } : {}),
      ...(e.servicos ? { servicos: e.servicos.filter((s) => s.nome?.trim()).map((s) => ({ nome: s.nome.trim(), ...(s.preco ? { preco: s.preco } : {}), ...(s.duracaoMin ? { duracaoMin: s.duracaoMin } : {}) })) } : {}),
      ...(e.formasPagamento ? { formasPagamento: seguro(e.formasPagamento) } : {}),
      ...(e.convenios ? { convenios: seguro(e.convenios) } : {}),
      ...(e.observacoes !== undefined ? { observacoes: e.observacoes.trim() } : {}),
    };
  }
  // the greeting usually quotes the company name: keep it in sync when only the name changed
  if (usar("empresa") && !p.saudacao && c.empresa.nome !== atual.empresa.nome && c.comportamento.saudacao.includes(atual.empresa.nome))
    c.comportamento.saudacao = c.comportamento.saudacao.replaceAll(atual.empresa.nome, c.empresa.nome);
  if (usar("saudacao")) {
    if (p.saudacao?.trim()) {
      if (saudacaoTemAviso(p.saudacao)) c.comportamento.saudacao = p.saudacao.trim();
      else avisos.saudacao = "A saudação sugerida não dizia que é a recepcionista virtual e que a ligação é gravada; mantivemos a atual.";
    }
    if (p.nomeAgente?.trim()) c.comportamento.nomeAgente = p.nomeAgente.trim().slice(0, 40);
    if (p.tom) c.comportamento.tom = p.tom;
  }
  if (usar("objetivos") && p.objetivos?.length) c.comportamento.objetivos = [...new Set([...p.objetivos, "recados" as const])];
  if (usar("regras") && (p.regrasAdicionar?.length || p.regrasRemover?.length)) {
    const sai = new Set((p.regrasRemover ?? []).map(normalizar));
    const k = c.comportamento;
    k.fazer = k.fazer.filter((x) => !sai.has(normalizar(x)));
    k.nuncaFazer = k.nuncaFazer.filter((x) => !sai.has(normalizar(x)));
    k.quandoTransferir = k.quandoTransferir.filter((x) => !sai.has(normalizar(x)));
    const novas = p.regrasAdicionar ?? [];
    const aceitas = novas.filter((r) => seguro([r.texto]).length);
    if (aceitas.length < novas.length) avisos.regras = "Removemos instruções para ela se passar por pessoa ou esconder a gravação: isso não é permitido.";
    const add = (alvo: string[], texto: string) => (alvo.some((x) => normalizar(x) === normalizar(texto)) ? alvo : [...alvo, texto.trim()]);
    for (const r of aceitas) {
      if (r.tipo === "sempre") k.fazer = add(k.fazer, r.texto);
      else if (r.tipo === "nunca") k.nuncaFazer = add(k.nuncaFazer, r.texto);
      else k.quandoTransferir = add(k.quandoTransferir, r.texto);
    }
  }
  if (usar("dados") && (p.dadosAdicionar?.length || p.dadosRemover?.length)) {
    const sai = new Set((p.dadosRemover ?? []).map(normalizar));
    const campos = c.dados.campos.filter((f) => !sai.has(normalizar(f.rotulo)));
    for (const d of p.dadosAdicionar ?? []) {
      const ch = chave(d.rotulo);
      if (!d.rotulo.trim()) continue;
      const i = campos.findIndex((f) => f.chave === ch);
      const campo = { chave: ch, rotulo: d.rotulo.trim(), tipo: d.tipo, obrigatorio: d.obrigatorio };
      if (i >= 0) campos[i] = campo;
      else campos.push(campo);
    }
    c.dados.campos = campos;
  }
  if (usar("horarios") && p.horarios) {
    for (const d of p.horarios.dias) {
      const atualDia = c.horarios.semana[d.dia];
      c.horarios.semana[d.dia] = { aberto: d.aberto, inicio: hora(d.inicio, atualDia.inicio), fim: hora(d.fim, atualDia.fim) };
    }
    if (p.horarios.foraDoHorario) c.horarios.foraDoHorario = p.horarios.foraDoHorario;
  }
  if (usar("acoes")) {
    if (p.agendar !== undefined) c.acoes.agendar.ativo = p.agendar;
    if (p.transferirPara?.replace(/\D/g, "").length && p.transferirPara.replace(/\D/g, "").length >= 10)
      c.acoes.transferir = { ...c.acoes.transferir, ativo: true, numero: p.transferirPara.trim() };
  }

  const config = agentConfigSchema.parse(c);
  const secoes = (Object.keys(SECOES) as IdSecao[])
    .map((id) => ({ id, titulo: SECOES[id], antes: linhas[id](atual), depois: linhas[id](config), ...(avisos[id] ? { aviso: avisos[id] } : {}) }))
    .filter((s) => s.aviso || JSON.stringify(s.antes) !== JSON.stringify(s.depois));
  return { config, secoes };
}

/** Prompt for the model: the current config in compact form plus the business's request. */
export function promptAssistente(atual: AgentConfig, pedido: string): string {
  const resumo = (Object.keys(SECOES) as IdSecao[]).map((id) => `## ${SECOES[id]}\n${linhas[id](atual).join("\n") || "—"}`).join("\n\n");
  return `Configuração atual da recepcionista:\n\n${resumo}\n\nObjetivos possíveis (use as chaves): ${Object.entries(OBJETIVOS)
    .map(([k, v]) => `${k} = ${v}`)
    .join("; ")}\n\nPedido do dono da empresa:\n"""${pedido.slice(0, 2000)}"""`;
}

export const SYSTEM_ASSISTENTE = `Você ajuda donos de pequenas empresas brasileiras a configurar a recepcionista virtual que atende o telefone da empresa.
Leia a configuração atual e o pedido, e devolva SÓ os campos que devem mudar (omita o resto).
Regras:
- Não invente preços, endereços, convênios ou telefones que o dono não informou.
- Para regras e dados use regrasAdicionar/regrasRemover e dadosAdicionar/dadosRemover: só o que entra ou sai. Não repita o que já existe.
- Cubra TUDO o que o dono disse: nome, cidade, serviços e preços, convênios, formas de pagamento, horários de cada dia, o que ela faz e quando passa para ele.
- Horário: devolva os dias citados (0 = domingo … 6 = sábado), com "aberto": false nos dias fechados.
- Escreva regras curtas e práticas, em português do Brasil, do ponto de vista da recepcionista ("Confirmar o convênio antes de agendar").
- A saudação deve ser curta, natural, dizer o nome da empresa, que é a recepcionista virtual e que a ligação é gravada.
- Ela nunca finge ser pessoa e nunca esconde que a ligação é gravada.
- Quando houver dúvida, preço especial, reclamação ou pedido de falar com alguém, ela passa o caso para a equipe.
- "Passar para mim", "me avisar", "falar comigo" = regra do tipo passar_para_equipe.

Exemplo. Pedido: "Pet shop Au Au em Santos, banho R$ 60. Abro de segunda a sábado das 9h às 18h. Ela marca banho e me passa quem quiser hotelzinho."
Resposta:
{"resumo":"Configurei o Pet shop Au Au, em Santos, com banho e horário de segunda a sábado.",
 "empresa":{"nome":"Pet shop Au Au","cidade":"Santos","servicos":[{"nome":"Banho","preco":"R$ 60"}]},
 "saudacao":"Pet shop Au Au, olá! Aqui é a Lia, recepcionista virtual. A ligação é gravada. Como posso ajudar?",
 "objetivos":["agendar","duvidas","recados"],
 "regrasAdicionar":[{"tipo":"passar_para_equipe","texto":"Interesse em hotelzinho"}],
 "horarios":{"dias":[{"dia":0,"aberto":false,"inicio":"09:00","fim":"18:00"},{"dia":1,"aberto":true,"inicio":"09:00","fim":"18:00"},{"dia":2,"aberto":true,"inicio":"09:00","fim":"18:00"},{"dia":3,"aberto":true,"inicio":"09:00","fim":"18:00"},{"dia":4,"aberto":true,"inicio":"09:00","fim":"18:00"},{"dia":5,"aberto":true,"inicio":"09:00","fim":"18:00"},{"dia":6,"aberto":true,"inicio":"09:00","fim":"18:00"}]},
 "agendar":true}`;
