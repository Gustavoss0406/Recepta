import { z } from "zod";

/**
 * Visual workflow (ElevenAgents "Workflow" tab): nodes and edges with natural-language conditions.
 * The runtime keeps the current node in the conversation state. On a "subagente" node the
 * receptionist follows that step's goal; when an outgoing condition is met it calls the
 * `seguir_fluxo` tool, and the automatic nodes after it (falar, atualizar_estado, acao,
 * transferir, fim) are resolved here, purely, so the logic is unit-testable.
 */
export const TIPOS_NO = ["inicio", "subagente", "falar", "acao", "atualizar_estado", "condicao", "transferir", "fim"] as const;
export type TipoNo = (typeof TIPOS_NO)[number];

export const noSchema = z.object({
  id: z.string().min(1).max(40),
  tipo: z.enum(TIPOS_NO),
  x: z.number(),
  y: z.number(),
  titulo: z.string().max(60).default(""),
  /** subagente: goal of the step; falar: exact sentence; acao: tool name; transferir: number; atualizar_estado: "chave=valor" */
  texto: z.string().max(2000).default(""),
});
export const arestaSchema = z.object({
  id: z.string().min(1).max(40),
  de: z.string(),
  para: z.string(),
  /** Natural-language condition (from subagents) or "sucesso" / "falha" (from actions). Empty = automatic. */
  condicao: z.string().max(200).default(""),
});
export const workflowSchema = z.object({
  ativo: z.boolean().default(false),
  nos: z.array(noSchema).max(40).default([]),
  arestas: z.array(arestaSchema).max(80).default([]),
});
export type No = z.infer<typeof noSchema>;
export type Aresta = z.infer<typeof arestaSchema>;
export type Workflow = z.infer<typeof workflowSchema>;

export const ROTULO_TIPO: Record<TipoNo, string> = {
  inicio: "Início",
  subagente: "Subagente",
  falar: "Falar",
  acao: "Ação",
  atualizar_estado: "Atualizar estado",
  condicao: "Condição",
  transferir: "Transferir",
  fim: "Fim",
};

/** Default flow for a receptionist: triage → scheduling or hand-off to the team. */
export function workflowPadrao(): Workflow {
  return {
    ativo: false,
    nos: [
      { id: "inicio", tipo: "inicio", x: 260, y: 0, titulo: "Início", texto: "" },
      { id: "triagem", tipo: "subagente", x: 180, y: 120, titulo: "Recepção", texto: "Entenda o que o cliente precisa e responda dúvidas com as informações da empresa." },
      { id: "agenda", tipo: "subagente", x: -60, y: 360, titulo: "Agendamento", texto: "Consulte a agenda, ofereça no máximo duas opções e confirme nome e telefone." },
      { id: "repasse", tipo: "acao", x: 440, y: 360, titulo: "Passar para a equipe", texto: "repassar_para_equipe" },
      { id: "fim1", tipo: "fim", x: 0, y: 560, titulo: "Fim", texto: "" },
      { id: "fim2", tipo: "fim", x: 500, y: 560, titulo: "Fim", texto: "" },
    ],
    arestas: [
      { id: "a1", de: "inicio", para: "triagem", condicao: "" },
      { id: "a2", de: "triagem", para: "agenda", condicao: "O cliente quer marcar, remarcar ou cancelar um horário" },
      { id: "a3", de: "triagem", para: "repasse", condicao: "Você não tem certeza de como resolver o pedido" },
      { id: "a4", de: "agenda", para: "fim1", condicao: "O horário foi confirmado e o cliente não precisa de mais nada" },
      { id: "a5", de: "repasse", para: "fim2", condicao: "sucesso" },
    ],
  };
}

export function no(wf: Workflow, id: string | undefined): No | undefined {
  return wf.nos.find((n) => n.id === id);
}

export function saidas(wf: Workflow, id: string): Aresta[] {
  return wf.arestas.filter((a) => a.de === id);
}

/** Problems that prevent publishing an active workflow (shown in the editor). */
export function validarWorkflow(wf: Workflow): string[] {
  if (!wf.ativo) return [];
  const erros: string[] = [];
  const inicios = wf.nos.filter((n) => n.tipo === "inicio");
  if (inicios.length !== 1) erros.push("O fluxo precisa de exatamente um nó Início.");
  for (const a of wf.arestas) if (!no(wf, a.de) || !no(wf, a.para)) erros.push(`A conexão ${a.id} aponta para um nó que não existe.`);
  for (const n of wf.nos) {
    const s = saidas(wf, n.id);
    if (n.tipo !== "fim" && n.tipo !== "transferir" && s.length === 0) erros.push(`"${n.titulo || ROTULO_TIPO[n.tipo]}" não tem saída.`);
    if (n.tipo === "subagente" && s.some((a) => !a.condicao.trim())) erros.push(`As saídas de "${n.titulo}" precisam de uma condição.`);
    if (n.tipo === "subagente" && !n.texto.trim()) erros.push(`Descreva o objetivo de "${n.titulo || "Subagente"}".`);
    if (n.tipo === "condicao") {
      const padrao = s.filter((a) => ehSenao(a.condicao));
      if (padrao.length > 1) erros.push(`"${n.titulo || "Condição"}" tem mais de um caminho "senão".`);
      for (const a of s) if (!ehSenao(a.condicao) && !lerExpressao(a.condicao)) erros.push(`Condição inválida em "${n.titulo || "Condição"}": ${a.condicao}`);
    }
  }
  return erros;
}

/* ───────── Conditions on data (deterministic, no model involved) ───────── */

export type Vars = Record<string, string>;
const ehSenao = (c: string) => /^\s*(senão|senao|caso contrário|caso contrario|padrão|padrao)?\s*$/i.test(c);

/** "var op valor": =, !=, >, <, >=, <=, contém; or just "var" (true when filled and not "não"/"falha"/"false"). */
export function lerExpressao(c: string): { var: string; op: string; valor: string } | null {
  const m = /^\s*([A-Za-z_][\w.]*)\s*(>=|<=|!=|=|>|<|contém|contem)\s*(.+?)\s*$/i.exec(c);
  if (m) return { var: m[1], op: m[2].toLowerCase().replace("contem", "contém"), valor: m[3].replace(/^["']|["']$/g, "") };
  const v = /^\s*([A-Za-z_][\w.]*)\s*$/.exec(c);
  return v ? { var: v[1], op: "existe", valor: "" } : null;
}

const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const VERDADE: Record<string, string> = { sim: "sim", true: "sim", verdadeiro: "sim", nao: "nao", false: "nao", falso: "nao" };

export function avaliarCondicao(c: string, vars: Vars): boolean {
  const e = lerExpressao(c);
  if (!e) return false;
  const bruto = vars[e.var];
  if (e.op === "existe") return bruto !== undefined && bruto !== "" && !["nao", "falha", "false", "0"].includes(norm(bruto));
  if (bruto === undefined) return e.op === "!=";
  const a = norm(bruto);
  const b = norm(e.valor);
  const [na, nb] = [Number(a.replace(",", ".")), Number(b.replace(",", "."))];
  const numerico = a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb);
  switch (e.op) {
    case "=":
      return numerico ? na === nb : (VERDADE[a] ?? a) === (VERDADE[b] ?? b);
    case "!=":
      return numerico ? na !== nb : (VERDADE[a] ?? a) !== (VERDADE[b] ?? b);
    case ">":
      return numerico && na > nb;
    case "<":
      return numerico && na < nb;
    case ">=":
      return numerico && na >= nb;
    case "<=":
      return numerico && na <= nb;
    case "contém":
      return a.includes(b);
  }
  return false;
}

/** Flattens a tool result into variables: "consultar_pedido = sucesso", "consultar_pedido.status = enviado". */
export function varsDeResultado(ferramenta: string, resultado: Record<string, unknown>): Vars {
  const v: Vars = { [ferramenta]: resultado.ok === false ? "falha" : "sucesso" };
  const dados = (resultado.dados ?? resultado) as Record<string, unknown>;
  if (dados && typeof dados === "object" && !Array.isArray(dados))
    for (const [k, x] of Object.entries(dados))
      if (x === null || ["string", "number", "boolean"].includes(typeof x)) v[`${ferramenta}.${k}`] = String(x).slice(0, 200);
      else if (Array.isArray(x)) v[`${ferramenta}.${k}`] = x.slice(0, 5).map(String).join(", ").slice(0, 200);
  return v;
}

export type Efeito =
  | { tipo: "falar"; texto: string }
  | { tipo: "estado"; chave: string; valor: string }
  | { tipo: "acao"; ferramenta: string; noId: string }
  | { tipo: "transferir"; numero: string }
  | { tipo: "fim" };

/**
 * Walks automatic nodes from `id` until reaching a subagent (where the conversation continues),
 * an action (which the runtime executes and then resumes with `retomarAposAcao`), or a terminal node.
 */
export function percorrer(wf: Workflow, id: string, vars: Vars = {}, limite = 20): { atual: string | null; efeitos: Efeito[] } {
  const efeitos: Efeito[] = [];
  const v = { ...vars };
  let atual: string | undefined = id;
  for (let i = 0; i < limite && atual; i++) {
    const n = no(wf, atual);
    if (!n) return { atual: null, efeitos };
    switch (n.tipo) {
      case "subagente":
        return { atual: n.id, efeitos };
      case "acao":
        efeitos.push({ tipo: "acao", ferramenta: n.texto.trim(), noId: n.id });
        return { atual: n.id, efeitos };
      case "transferir":
        efeitos.push({ tipo: "transferir", numero: n.texto.trim() });
        return { atual: null, efeitos };
      case "fim":
        efeitos.push({ tipo: "fim" });
        return { atual: null, efeitos };
      case "falar":
        if (n.texto.trim()) efeitos.push({ tipo: "falar", texto: n.texto.trim() });
        break;
      case "atualizar_estado": {
        const [chave, ...resto] = n.texto.split("=");
        if (chave?.trim()) {
          efeitos.push({ tipo: "estado", chave: chave.trim(), valor: resto.join("=").trim() });
          v[chave.trim()] = resto.join("=").trim();
        }
        break;
      }
      case "condicao": {
        // first matching condition wins; "senão" (empty) is the fallback
        const s = saidas(wf, n.id);
        const a = s.find((x) => !ehSenao(x.condicao) && avaliarCondicao(x.condicao, v)) ?? s.find((x) => ehSenao(x.condicao));
        if (!a) {
          efeitos.push({ tipo: "fim" });
          return { atual: null, efeitos };
        }
        atual = a.para;
        continue;
      }
    }
    atual = saidas(wf, n.id)[0]?.para;
  }
  return { atual: atual ?? null, efeitos };
}

/** Where the conversation starts: the first step after Início. */
export function iniciarFluxo(wf: Workflow, vars: Vars = {}) {
  const inicio = wf.nos.find((n) => n.tipo === "inicio");
  const prox = inicio && saidas(wf, inicio.id)[0]?.para;
  return prox ? percorrer(wf, prox, vars) : { atual: null, efeitos: [] as Efeito[] };
}

/** The model chose an outgoing edge of the current subagent. */
export function seguir(wf: Workflow, atual: string, arestaId: string, vars: Vars = {}) {
  const a = saidas(wf, atual).find((x) => x.id === arestaId);
  if (!a) return null;
  return percorrer(wf, a.para, vars);
}

/** After an action node ran: follow its "sucesso" / "falha" edge (or the only edge). */
export function retomarAposAcao(wf: Workflow, noAcao: string, ok: boolean, vars: Vars = {}) {
  const s = saidas(wf, noAcao);
  const a = s.find((x) => x.condicao.trim().toLowerCase() === (ok ? "sucesso" : "falha")) ?? (s.length === 1 ? s[0] : undefined);
  return a ? percorrer(wf, a.para, vars) : { atual: null, efeitos: [{ tipo: "fim" }] as Efeito[] };
}

/** Context block given to the model on every turn while the workflow is active. */
export function contextoEtapa(wf: Workflow, atual: string): string | null {
  const n = no(wf, atual);
  if (!n || n.tipo !== "subagente") return null;
  const s = saidas(wf, atual);
  return [
    `Etapa atual do atendimento: ${n.titulo}.`,
    `Objetivo desta etapa: ${n.texto}`,
    s.length
      ? `Quando uma destas situações acontecer, use a ferramenta seguir_fluxo com o caminho correspondente (não fale do fluxo com o cliente):\n${s.map((a) => `- ${a.id}: ${a.condicao}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
