import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { novoBancoDeTeste } from "../../../test/db";
import { schema, type Db } from "@/db/client";
import { criarConta } from "@/server/auth/conta";
import { criarAgente, publicar, salvarRascunho } from "./agentes";
import { adicionarTexto, buscarConhecimento } from "./conhecimento";
import { encerrarConversa, ErroLinhaOcupada, iniciarConversa, responder } from "./runtime";
import { setLlm, type Llm, type TurnoReq } from "@/server/providers/llm";
import { workflowPadrao } from "@/lib/agent/workflow";
import { trocarPlano, resumoCobranca } from "@/server/billing/assinaturas";

/** Scripted Claude stand-in: inspects the request and answers like the model would. */
class LlmRoteirizado implements Llm {
  readonly real = true;
  pedidos: TurnoReq[] = [];
  sucesso = true;
  async turno(req: TurnoReq) {
    this.pedidos.push(req);
    const ultimo = req.messages.at(-1)!;
    const blocos = ultimo.content as Anthropic.ContentBlockParam[];
    const res = blocos.find((b) => b.type === "tool_result") as Anthropic.ToolResultBlockParam | undefined;
    const uso = { input: 1200, cached: 0, output: 40 };
    const tool = (name: string, input: object) =>
      ({ content: [{ type: "tool_use", id: `t_${name}`, name, input } as unknown as Anthropic.ContentBlock], stopReason: "tool_use", uso });
    const fala = (text: string) => ({ content: [{ type: "text", text, citations: null } as Anthropic.ContentBlock], stopReason: "end_turn", uso });
    if (res) {
      const d = JSON.parse(String(res.content));
      if (typeof d.proximo === "string" && d.proximo.includes("repassar_para_equipe"))
        return tool("repassar_para_equipe", { motivo: "Pedido fora das regras", o_que_o_cliente_quer: "Preço especial", urgencia: "baixa" });
      if (d.fluxo?.proximo) return fala("Obrigada pela ligação, até logo!");
      if (d.etapa) return fala("Certo.");
      if (d.horarios) return fala(`Tenho ${d.horarios[0].rotulo}. Pode ser?`);
      if (d.ok && d.rotulo) return fala(`Agendado para ${d.rotulo}.`);
      return fala("Até logo!");
    }
    const txt = (blocos.at(-1) as Anthropic.TextBlockParam).text;
    if (txt.includes("marcar")) return tool("consultar_horarios", {});
    if (txt.includes("pode ser")) {
      const r = req.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((b) => b.type === "tool_result") as Anthropic.ToolResultBlockParam;
      return tool("agendar", { inicio: JSON.parse(String(r.content)).horarios[0].inicio, nome: "Maria", telefone: "11999990000" });
    }
    if (txt.includes("tchau")) return tool("encerrar_ligacao", {});
    if (txt.includes("preço especial") && req.tools?.some((t) => t.name === "seguir_fluxo")) return tool("seguir_fluxo", { caminho: "a3" });
    if (txt.includes("mudar meu horário") && req.tools?.some((t) => t.name === "seguir_fluxo")) return tool("seguir_fluxo", { caminho: "a2" });
    if (txt.includes("desconto"))
      return tool("repassar_para_equipe", {
        motivo: "Pedido de desconto precisa de decisão da equipe",
        o_que_o_cliente_quer: "Desconto no clareamento",
        urgencia: "media",
        nome: "João",
        proximo_passo: "Retornar com a proposta",
      });
    return fala("Posso ajudar?");
  }
  async estruturado<T>(): Promise<{ dados: T; uso: { input: number; cached: number; output: number } }> {
    return {
      dados: {
        resumo: "Maria agendou uma consulta.",
        motivo: "Agendar consulta",
        resultado: "resolvido",
        dados: { nome: "Maria", telefone: "11999990000", convenio: "", motivo: "consulta" },
        sucesso: this.sucesso,
        justificativa: this.sucesso ? "Agendou conforme pedido." : "Não soube informar o preço.",
        sentimento: "positivo",
      } as T,
      uso: { input: 900, cached: 0, output: 120 },
    };
  }
}

let db: Db;
let orgId: string;
let agenteId: string;
const llm = new LlmRoteirizado();

beforeAll(async () => {
  db = await novoBancoDeTeste();
  setLlm(llm);
  ({ orgId } = await criarConta({ nome: "Ana", email: "ana@sorriso.com", senha: "senhaforte1", empresa: "Clínica Sorriso", nicho: "clinica" }));
  const a = await criarAgente(orgId, "clinica", { nome: "Clínica Sorriso", cidade: "Campinas" });
  agenteId = a.id;
  await adicionarTexto(orgId, agenteId, "Convênios", "Aceitamos os convênios Unimed e Bradesco Saúde. Estacionamento gratuito no local.");
});
afterAll(() => setLlm(undefined));

describe("Conhecimento", () => {
  it("busca em português com stemming e fallback OU", async () => {
    expect((await buscarConhecimento(agenteId, "vocês aceitam convênio unimed?"))[0]?.texto).toContain("Unimed");
    expect((await buscarConhecimento(agenteId, "tem estacionamento?"))[0]?.texto).toContain("Estacionamento");
    expect(await buscarConhecimento(agenteId, "piscina aquecida")).toEqual([]);
  });
});

describe("Runtime do agente", () => {
  it("teste em texto no rascunho: consulta, agenda, encerra; sem minutos cobrados", async () => {
    const ini = await iniciarConversa({ orgId, agenteId, canal: "teste_texto" });
    expect(ini.saudacao).toMatch(/recepcionista virtual/);
    expect(ini.saudacao).toMatch(/gravada/);
    expect(ini.saudacao).not.toMatch(/intelig[êe]ncia artificial/);
    const r1 = await responder(ini.conversaId, "quero marcar uma consulta, meu CPF é 123.456.789-09");
    expect(r1.acoes.map((a) => a.nome)).toEqual(["consultar_horarios"]);
    expect(r1.falas.at(-1)).toMatch(/^Tenho /);
    // first request carries temporal context, knowledge and the masked utterance
    const primeiro = llm.pedidos[0].messages[0].content as Anthropic.TextBlockParam[];
    expect(primeiro[0].text).toContain("horário de Brasília");
    expect(primeiro.at(-1)!.text).toContain("•••.•••.•••-09");

    const r2 = await responder(ini.conversaId, "pode ser");
    expect(r2.acoes[0].nome).toBe("agendar");
    expect(r2.acoes[0].resultado.ok).toBe(true);
    const r3 = await responder(ini.conversaId, "tchau");
    expect(r3.encerrar).toBe(true);

    const fim = await encerrarConversa(ini.conversaId, { duracaoS: 95 });
    expect(fim.minutosCobrados).toBe(0);
    expect(fim.resultado).toBe("resolvido");
    expect(fim.dados).toMatchObject({ nome: "Maria" });
    const [ev] = await db.select().from(schema.agendaEventos).where(eq(schema.agendaEventos.conversaId, ini.conversaId));
    expect(ev.simulado).toBe(true);
    const [custo] = await db.select().from(schema.registroCusto).where(eq(schema.registroCusto.conversaId, ini.conversaId));
    expect(custo.tipo).toBe("teste");
    expect(custo.custoBrl).toBeGreaterThan(0);
  });

  it("ligação real exige versão publicada, cobra minutos e entra no uso do ciclo", async () => {
    await expect(iniciarConversa({ orgId, agenteId, canal: "telefone" })).rejects.toThrow(/publicado/);
    await salvarRascunho(orgId, agenteId, { acoes: { transferir: { ativo: true, numero: "+5511333344444", somenteHorarioComercial: false } } });
    await publicar(orgId, agenteId, { id: "u", papel: "dono" });
    const ini = await iniciarConversa({ orgId, agenteId, canal: "telefone", de: "+5511999990000" });
    expect(ini.teste).toBe(false);
    await responder(ini.conversaId, "olá");
    const fim = await encerrarConversa(ini.conversaId, { duracaoS: 125 });
    expect(fim.minutosCobrados).toBe(3);
    const r = await resumoCobranca(orgId);
    expect(r.uso.minutos).toBe(3);
    const ativas = await db.select().from(schema.chamadasAtivas);
    expect(ativas).toHaveLength(0);
  });

  it("limite de chamadas simultâneas: trial = 1 linha", async () => {
    const a = await iniciarConversa({ orgId, agenteId, canal: "telefone" });
    await expect(iniciarConversa({ orgId, agenteId, canal: "telefone" })).rejects.toBeInstanceOf(ErroLinhaOcupada);
    await encerrarConversa(a.conversaId, { duracaoS: 30 });
  });

  it("pico: acima do limite com pico habilitado a chamada entra marcada", async () => {
    await trocarPlano(orgId, "start", "mensal");
    await db.update(schema.assinaturas).set({ picoHabilitado: true }).where(eq(schema.assinaturas.orgId, orgId));
    const c1 = await iniciarConversa({ orgId, agenteId, canal: "telefone" });
    const c2 = await iniciarConversa({ orgId, agenteId, canal: "telefone" });
    const c3 = await iniciarConversa({ orgId, agenteId, canal: "telefone" }); // Start = 2 linhas
    const [p3] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, c3.conversaId));
    expect(p3.pico).toBe(true);
    for (const c of [c1, c2, c3]) await encerrarConversa(c.conversaId, { duracaoS: 60 });
    const r = await resumoCobranca(orgId);
    expect(r.uso.minutosPico).toBe(1);
  });
});

describe("Repasse para a equipe", () => {
  it("na dúvida, o agente passa o caso com relatório: pendência, aviso ao dono e conversa repassada", async () => {
    const ini = await iniciarConversa({ orgId, agenteId, canal: "telefone", de: "+5511988887777" });
    const r = await responder(ini.conversaId, "consigo um desconto no clareamento?");
    expect(r.acoes[0].nome).toBe("repassar_para_equipe");
    expect(r.acoes[0].resultado.ok).toBe(true);
    const [rep] = await db.select().from(schema.repasses).where(eq(schema.repasses.conversaId, ini.conversaId));
    expect(rep).toMatchObject({ origem: "agente", status: "pendente", contatoNome: "João", contatoTelefone: "+5511988887777", urgencia: "media" });
    expect(rep.titulo).toBe("João: Desconto no clareamento");
    expect(rep.trecho).toContain("Cliente: consigo um desconto");
    const avisos = await db.select().from(schema.caixaSaida).where(eq(schema.caixaSaida.orgId, orgId));
    expect(avisos.some((a) => a.canal === "email" && a.destino === "ana@sorriso.com" && a.assunto?.startsWith("Pendência"))).toBe(true);
    const fim = await encerrarConversa(ini.conversaId, { duracaoS: 40 });
    expect(fim.sinalizada).toBe(true);
  });

  it("rede de segurança: ligação mal resolvida e sem repasse vira pendência automática", async () => {
    llm.sucesso = false;
    try {
      const ini = await iniciarConversa({ orgId, agenteId, canal: "telefone", de: "+5511977776666" });
      await responder(ini.conversaId, "quanto custa o implante?");
      await encerrarConversa(ini.conversaId, { duracaoS: 30 });
      const [rep] = await db.select().from(schema.repasses).where(eq(schema.repasses.conversaId, ini.conversaId));
      expect(rep.origem).toBe("automatico");
      expect(rep.motivo).toContain("Não soube informar o preço");
    } finally {
      llm.sucesso = true;
    }
  });

  it("em teste, o repasse não cria pendência nem avisa ninguém", async () => {
    const ini = await iniciarConversa({ orgId, agenteId, canal: "teste_texto" });
    const r = await responder(ini.conversaId, "tem desconto?");
    expect(r.acoes[0].resultado).toMatchObject({ ok: true, simulado: true });
    expect(await db.select().from(schema.repasses).where(eq(schema.repasses.conversaId, ini.conversaId))).toHaveLength(0);
  });
});

describe("Workflow no runtime", () => {
  it("segue a etapa, troca de subagente e termina pelo nó de ação", async () => {
    await salvarRascunho(orgId, agenteId, { workflow: { ...workflowPadrao(), ativo: true } });
    const ini = await iniciarConversa({ orgId, agenteId, canal: "teste_texto" });
    const n0 = llm.pedidos.length;
    const r1 = await responder(ini.conversaId, "preciso mudar meu horário");
    const pedido = llm.pedidos[n0];
    expect(JSON.stringify(pedido.messages[0].content)).toContain("Etapa atual do atendimento: Recepção");
    expect(pedido.tools?.some((t) => t.name === "seguir_fluxo")).toBe(true);
    expect(r1.acoes[0]).toMatchObject({ nome: "seguir_fluxo", resultado: { etapa: "Agendamento" } });
    let [c] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, ini.conversaId));
    expect(c.estado?.no).toBe("agenda");

    const ini2 = await iniciarConversa({ orgId, agenteId, canal: "teste_texto" });
    const r2 = await responder(ini2.conversaId, "vocês fazem preço especial?");
    expect(r2.acoes.map((a) => a.nome)).toEqual(["seguir_fluxo", "repassar_para_equipe"]);
    expect(r2.encerrar).toBe(true);
    [c] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, ini2.conversaId));
    expect(c.estado?.no).toBeNull();
    await salvarRascunho(orgId, agenteId, { workflow: workflowPadrao() });
  });
});

describe("Sem motor disponível", () => {
  it("pede desculpas, passa o pedido para a equipe e encerra (nunca deixa o cliente em silêncio)", async () => {
    const { ErroSemMotor } = await import("@/server/providers/llm-rotacao");
    setLlm({ real: true, gratuito: true, turno: async () => { throw new ErroSemMotor(["groq: cota diária"]); }, estruturado: async () => { throw new ErroSemMotor([]); } });
    try {
      const ini = await iniciarConversa({ orgId, agenteId, canal: "telefone", de: "+5511955554444" });
      const r = await responder(ini.conversaId, "quero saber o preço da limpeza");
      expect(r.encerrar).toBe(true);
      expect(r.falas.at(-1)).toMatch(/passei o seu pedido para a equipe/);
      const [rep] = await db.select().from(schema.repasses).where(eq(schema.repasses.conversaId, ini.conversaId));
      expect(rep).toMatchObject({ origem: "automatico", pedido: "quero saber o preço da limpeza" });
      await encerrarConversa(ini.conversaId, { duracaoS: 20 });
    } finally {
      setLlm(llm);
    }
  });
});
