import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { listarAgentes, obterAgente, publicar } from "@/server/agent/agentes";
import { iniciarConversa, responder, encerrarConversa } from "@/server/agent/runtime";
import { serializar } from "@/server/api/serializar";

/**
 * Recepta as MCP tools: assistants (Claude, ChatGPT, Cursor…) read calls and hand-offs, test and
 * adjust receptionists for the organization that owns the API key. Writes are limited to the draft,
 * hand-off status and an explicit publish.
 */
export interface FerramentaMcp {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  run: (orgId: string, args: Record<string, unknown>) => Promise<unknown>;
}

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const num = (description: string) => ({ type: "number", description });
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

async function autorDono(orgId: string) {
  const [m] = await getDb()
    .select()
    .from(schema.membros)
    .where(and(eq(schema.membros.orgId, orgId), eq(schema.membros.papel, "dono")))
    .limit(1);
  if (!m) throw new Error("Organização sem dono");
  return { id: m.usuarioId, papel: m.papel };
}

export const FERRAMENTAS_MCP: FerramentaMcp[] = [
  {
    name: "listar_recepcionistas",
    title: "Listar recepcionistas",
    description: "Lista as recepcionistas da empresa com nome, voz, se estão publicadas e se o rascunho tem mudanças.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: async (orgId) =>
      (await listarAgentes(orgId)).map((a) => ({
        id: a.id,
        nome: a.nome,
        recepcionista: a.rascunho.comportamento.nomeAgente,
        empresa: a.rascunho.empresa.nome,
        voz: a.rascunho.voz.vozId,
        publicada: Boolean(a.versaoPublicadaId),
        status: a.status,
      })),
  },
  {
    name: "ver_recepcionista",
    title: "Ver configuração",
    description: "Mostra a configuração do rascunho de uma recepcionista: saudação, regras, dados coletados, horários e ações ligadas.",
    inputSchema: { type: "object", properties: { recepcionista_id: str("id da recepcionista") }, required: ["recepcionista_id"] },
    annotations: { readOnlyHint: true },
    run: async (orgId, a) => {
      const ag = await obterAgente(orgId, texto(a.recepcionista_id));
      const c = ag.rascunho;
      return {
        empresa: c.empresa,
        saudacao: c.comportamento.saudacao,
        objetivos: c.comportamento.objetivos,
        sempre: c.comportamento.fazer,
        nunca: c.comportamento.nuncaFazer,
        passar_para_equipe: c.comportamento.quandoTransferir,
        dados_coletados: c.dados.campos.map((f) => f.rotulo),
        horarios: c.horarios,
        acoes: {
          agendar: c.acoes.agendar.ativo,
          transferir: c.acoes.transferir.ativo,
          apis: (c.acoes.apis ?? []).map((x) => ({ nome: x.nome, nivel: x.nivel, descricao: x.descricao })),
          colegas: c.acoes.colegas ?? [],
        },
      };
    },
  },
  {
    name: "listar_ligacoes",
    title: "Listar ligações",
    description: "Lista as ligações reais mais recentes com resultado, resumo e duração. Filtre por recepcionista, resultado ou dias.",
    inputSchema: {
      type: "object",
      properties: {
        recepcionista_id: str("opcional"),
        resultado: str("opcional", { enum: ["resolvido", "agendado", "repassado", "transferido", "nao_resolvido", "recado"] }),
        dias: num("últimos N dias (padrão 7)"),
        limite: num("máximo 50 (padrão 20)"),
      },
    },
    annotations: { readOnlyHint: true },
    run: async (orgId, a) => {
      const c = schema.conversas;
      const f = [eq(c.orgId, orgId), eq(c.teste, false), gte(c.iniciadaEm, new Date(Date.now() - Math.min(Number(a.dias) || 7, 90) * 86_400_000))];
      if (texto(a.recepcionista_id)) f.push(eq(c.agenteId, texto(a.recepcionista_id)));
      if (texto(a.resultado)) f.push(eq(c.resultado, texto(a.resultado) as "resolvido"));
      const rows = await getDb().select().from(c).where(and(...f)).orderBy(desc(c.iniciadaEm)).limit(Math.min(Number(a.limite) || 20, 50));
      return rows.map(serializar);
    },
  },
  {
    name: "ver_ligacao",
    title: "Ver ligação",
    description: "Mostra uma ligação completa: transcrição, ações executadas, dados coletados e avaliação.",
    inputSchema: { type: "object", properties: { ligacao_id: str("id da ligação") }, required: ["ligacao_id"] },
    annotations: { readOnlyHint: true },
    run: async (orgId, a) => {
      const db = getDb();
      const [c] = await db
        .select()
        .from(schema.conversas)
        .where(and(eq(schema.conversas.orgId, orgId), eq(schema.conversas.id, texto(a.ligacao_id))));
      if (!c) throw new Error("Ligação não encontrada");
      const [turnos, acoes] = await Promise.all([
        db.select({ papel: schema.turnos.papel, texto: schema.turnos.texto }).from(schema.turnos).where(eq(schema.turnos.conversaId, c.id)).orderBy(schema.turnos.ordem),
        db.select({ nome: schema.chamadasFerramenta.nome, args: schema.chamadasFerramenta.args, resultado: schema.chamadasFerramenta.resultado }).from(schema.chamadasFerramenta).where(eq(schema.chamadasFerramenta.conversaId, c.id)),
      ]);
      return { ...serializar(c), transcricao: turnos, acoes };
    },
  },
  {
    name: "listar_pendencias",
    title: "Listar pendências",
    description: "Casos que a recepcionista passou para a equipe, com motivo, pedido do cliente, contato, urgência e próximo passo.",
    inputSchema: { type: "object", properties: { status: str("padrão: pendente", { enum: ["pendente", "em_andamento", "resolvido"] }), limite: num("máximo 50") } },
    annotations: { readOnlyHint: true },
    run: async (orgId, a) => {
      const r = schema.repasses;
      return getDb()
        .select({ id: r.id, titulo: r.titulo, motivo: r.motivo, pedido: r.pedido, urgencia: r.urgencia, proximo_passo: r.proximoPasso, nome: r.contatoNome, telefone: r.contatoTelefone, status: r.status, criado_em: r.criadoEm, ligacao_id: r.conversaId })
        .from(r)
        .where(and(eq(r.orgId, orgId), eq(r.status, (texto(a.status) || "pendente") as "pendente")))
        .orderBy(desc(r.criadoEm))
        .limit(Math.min(Number(a.limite) || 20, 50));
    },
  },
  {
    name: "atualizar_pendencia",
    title: "Atualizar pendência",
    description: "Marca uma pendência como em andamento ou resolvida, com uma nota do que foi feito.",
    inputSchema: {
      type: "object",
      properties: { pendencia_id: str("id"), status: str("novo status", { enum: ["em_andamento", "resolvido"] }), nota: str("o que foi feito") },
      required: ["pendencia_id", "status"],
    },
    annotations: { idempotentHint: true },
    run: async (orgId, a) => {
      const status = texto(a.status) as "em_andamento" | "resolvido";
      if (!["em_andamento", "resolvido"].includes(status)) throw new Error("Status inválido");
      const [p] = await getDb()
        .update(schema.repasses)
        .set({ status, nota: texto(a.nota) || null, resolvidoEm: status === "resolvido" ? new Date() : null })
        .where(and(eq(schema.repasses.orgId, orgId), eq(schema.repasses.id, texto(a.pendencia_id))))
        .returning({ id: schema.repasses.id, status: schema.repasses.status });
      if (!p) throw new Error("Pendência não encontrada");
      return p;
    },
  },
  {
    name: "testar_recepcionista",
    title: "Testar recepcionista",
    description: "Conversa por texto com o rascunho de uma recepcionista, como se fosse um cliente. Mande várias falas em ordem para simular uma ligação inteira. Não conta como ligação real.",
    inputSchema: {
      type: "object",
      properties: { recepcionista_id: str("id"), falas: { type: "array", items: { type: "string" }, description: "falas do cliente, em ordem (máx. 8)" } },
      required: ["recepcionista_id", "falas"],
    },
    run: async (orgId, a) => {
      const falas = (Array.isArray(a.falas) ? a.falas : []).map(String).filter(Boolean).slice(0, 8);
      if (!falas.length) throw new Error("Mande ao menos uma fala");
      const { conversaId, saudacao } = await iniciarConversa({ orgId, agenteId: texto(a.recepcionista_id), canal: "teste_texto", alvo: "rascunho" });
      const dialogo: { cliente?: string; recepcionista: string; acoes?: string[] }[] = [{ recepcionista: saudacao }];
      for (const f of falas) {
        const r = await responder(conversaId, f);
        dialogo.push({ cliente: f, recepcionista: r.falas.join(" "), ...(r.acoes.length ? { acoes: r.acoes.map((x) => x.nome) } : {}) });
        if (r.encerrar) break;
      }
      await encerrarConversa(conversaId, { duracaoS: 0 }).catch(() => null);
      return dialogo;
    },
  },
  {
    name: "ajustar_recepcionista",
    title: "Propor ajuste",
    description:
      "Propõe mudanças no rascunho a partir de um pedido em linguagem natural (ex.: 'peça o CPF antes de agendar'). Devolve as seções com antes/depois e uma proposta. NADA é salvo: para aplicar, chame aplicar_ajuste com a proposta.",
    inputSchema: { type: "object", properties: { recepcionista_id: str("id"), pedido: str("o que mudar") }, required: ["recepcionista_id", "pedido"] },
    annotations: { readOnlyHint: true },
    run: async (orgId, a) => {
      const { proporMudancas } = await import("@/server/agent/assistente");
      return proporMudancas(orgId, texto(a.recepcionista_id), texto(a.pedido));
    },
  },
  {
    name: "aplicar_ajuste",
    title: "Aplicar ajuste",
    description: "Aplica no RASCUNHO as seções escolhidas de uma proposta de ajustar_recepcionista. A versão publicada não muda até publicar.",
    inputSchema: {
      type: "object",
      properties: {
        recepcionista_id: str("id"),
        proposta: { type: "object", description: "o campo 'proposta' devolvido por ajustar_recepcionista" },
        secoes: { type: "array", items: { type: "string", enum: ["empresa", "saudacao", "objetivos", "regras", "dados", "horarios", "acoes"] } },
      },
      required: ["recepcionista_id", "proposta", "secoes"],
    },
    run: async (orgId, a) => {
      const { aplicarMudancas } = await import("@/server/agent/assistente");
      const secoes = (Array.isArray(a.secoes) ? a.secoes : []).map(String) as ("empresa" | "saudacao" | "objetivos" | "regras" | "dados" | "horarios" | "acoes")[];
      if (!secoes.length) throw new Error("Escolha ao menos uma seção");
      await aplicarMudancas(orgId, texto(a.recepcionista_id), a.proposta, secoes);
      return { ok: true, mensagem: "Aplicado no rascunho. Teste com testar_recepcionista e publique com publicar_recepcionista." };
    },
  },
  {
    name: "publicar_recepcionista",
    title: "Publicar",
    description: "Publica o rascunho: a partir daí as ligações reais usam esta versão. Peça confirmação ao usuário antes de chamar.",
    inputSchema: { type: "object", properties: { recepcionista_id: str("id"), nota: str("o que mudou nesta versão") }, required: ["recepcionista_id"] },
    annotations: { destructiveHint: true },
    run: async (orgId, a) => {
      const v = await publicar(orgId, texto(a.recepcionista_id), await autorDono(orgId), { nota: texto(a.nota) || "Publicado via MCP" });
      return { ok: true, versao: v.numero ?? v.id };
    },
  },
  {
    name: "resumo_do_periodo",
    title: "Resumo do período",
    description: "Números das ligações reais: total, minutos, resultados e pendências abertas, nos últimos N dias.",
    inputSchema: { type: "object", properties: { dias: num("padrão 30") } },
    annotations: { readOnlyHint: true },
    run: async (orgId, a) => {
      const desde = new Date(Date.now() - Math.min(Number(a.dias) || 30, 365) * 86_400_000);
      const c = schema.conversas;
      const rows = await getDb()
        .select({ resultado: c.resultado, duracaoS: c.duracaoS })
        .from(c)
        .where(and(eq(c.orgId, orgId), eq(c.teste, false), gte(c.iniciadaEm, desde)));
      const porResultado: Record<string, number> = {};
      for (const r of rows) porResultado[r.resultado ?? "em_andamento"] = (porResultado[r.resultado ?? "em_andamento"] ?? 0) + 1;
      const [abertas] = await getDb()
        .select({ id: schema.repasses.id })
        .from(schema.repasses)
        .where(and(eq(schema.repasses.orgId, orgId), eq(schema.repasses.status, "pendente")));
      return {
        desde: desde.toISOString(),
        ligacoes: rows.length,
        minutos: Math.round(rows.reduce((s, r) => s + (r.duracaoS ?? 0), 0) / 60),
        por_resultado: porResultado,
        tem_pendencias_abertas: Boolean(abertas),
      };
    },
  },
];
