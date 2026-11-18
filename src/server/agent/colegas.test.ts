import { beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { novoBancoDeTeste } from "../../../test/db";
import { schema, type Db } from "@/db/client";
import { criarConta } from "@/server/auth/conta";
import { criarAgente, obterAgente, salvarRascunho } from "./agentes";
import { iniciarConversa, responder } from "./runtime";
import { setLlm, type Llm, type TurnoReq } from "@/server/providers/llm";

/** Front desk passes payment questions to the finance receptionist; finance introduces herself. */
class LlmColegas implements Llm {
  readonly real = true;
  pedidos: TurnoReq[] = [];
  async turno(req: TurnoReq) {
    this.pedidos.push(req);
    const uso = { input: 100, cached: 0, output: 10 };
    const fala = (text: string) => ({ content: [{ type: "text", text, citations: null } as Anthropic.ContentBlock], stopReason: "end_turn", uso });
    const ultimo = req.messages.at(-1)!.content as Anthropic.ContentBlockParam[];
    const texto = ultimo.map((b) => (b.type === "text" ? b.text : "")).join(" ");
    if (texto.includes("[Passagem interna]")) return fala("Oi, aqui é a Bia, do financeiro. Vi que é sobre o boleto, vamos resolver.");
    if (texto.includes("boleto")) {
      const ferramenta = req.tools.find((t) => t.name === "passar_para_colega");
      const colega = (ferramenta?.input_schema as { properties: { colega: { enum: string[] } } } | undefined)?.properties.colega.enum[0];
      return {
        content: [
          { type: "text", text: "Vou te passar para a Bia, do financeiro.", citations: null } as Anthropic.ContentBlock,
          { type: "tool_use", id: "t1", name: "passar_para_colega", input: { colega, motivo: "Segunda via do boleto" } } as unknown as Anthropic.ContentBlock,
        ],
        stopReason: "tool_use",
        uso,
      };
    }
    return fala(req.system.includes("Bia") ? "Pronto, enviei a segunda via." : "Posso ajudar?");
  }
  async estruturado<T>(): Promise<{ dados: T; uso: { input: number; cached: number; output: number } }> {
    throw new Error("não usado");
  }
}

let db: Db;
let orgId: string;
let recepcao: string;
let financeiro: string;
const llm = new LlmColegas();

beforeAll(async () => {
  db = await novoBancoDeTeste();
  setLlm(llm);
  ({ orgId } = await criarConta({ nome: "Ana", email: "ana-colegas@x.com", senha: "senhaforte1", empresa: "Clínica", nicho: "clinica" }));
  recepcao = (await criarAgente(orgId, "clinica", { nome: "Clínica" })).id;
  financeiro = (await criarAgente(orgId, "clinica", { nome: "Clínica" })).id;
  const fin = (await obterAgente(orgId, financeiro)).rascunho;
  await salvarRascunho(orgId, financeiro, { comportamento: { ...fin.comportamento, nomeAgente: "Bia" }, voz: { ...fin.voz, vozId: "bia" } });
  const rec = (await obterAgente(orgId, recepcao)).rascunho;
  await salvarRascunho(orgId, recepcao, { acoes: { ...rec.acoes, colegas: [{ agenteId: financeiro, nome: "Bia", quando: "Pagamentos e boletos" }] } });
});

describe("Passar para outra recepcionista", () => {
  it("a colega assume com o histórico, se apresenta e continua nas próximas falas", async () => {
    const { conversaId } = await iniciarConversa({ orgId, agenteId: recepcao, canal: "teste_texto", alvo: "rascunho" });
    const r = await responder(conversaId, "Preciso da segunda via do boleto");
    expect(r.falas).toEqual(["Vou te passar para a Bia, do financeiro.", "Oi, aqui é a Bia, do financeiro. Vi que é sobre o boleto, vamos resolver."]);
    expect(r.colega).toMatchObject({ agenteId: financeiro, nome: "Bia", vozId: "bia", aPartirDe: 1 });
    // the colleague's turn ran with her own prompt and the whole history
    const apresentacao = llm.pedidos.at(-1)!;
    expect(apresentacao.system).toContain("Bia");
    expect(apresentacao.messages.length).toBeGreaterThan(3);

    const r2 = await responder(conversaId, "Obrigado");
    expect(r2.falas).toEqual(["Pronto, enviei a segunda via."]);
    expect(r2.colega).toBeUndefined();
    const [c] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, conversaId));
    expect(c.agenteId).toBe(recepcao); // billing/analytics stay with the original receptionist
    expect(c.estado?.agenteAtivo).toBe(financeiro);
  });

  it("recusa colega que não está na lista", async () => {
    const rec = (await obterAgente(orgId, recepcao)).rascunho;
    expect(rec.acoes.colegas).toHaveLength(1);
    const { definirFerramentas } = await import("./ferramentas");
    const tool = definirFerramentas(rec).find((t) => t.name === "passar_para_colega")!;
    expect((tool.input_schema as { properties: { colega: { enum: string[] } } }).properties.colega.enum).toEqual([financeiro]);
  });
});

describe("Resumo em segundo plano", () => {
  it("resume o começo e não sobrescreve se o cliente falou no meio", async () => {
    const { compactarConversa } = await import("./runtime");
    const { conversaId } = await iniciarConversa({ orgId, agenteId: financeiro, canal: "teste_texto", alvo: "rascunho" });
    const msgs: unknown[] = [];
    for (let i = 0; i < 15; i++) msgs.push({ role: "user", content: [{ type: "text", text: `Cliente: fala ${i}` }] }, { role: "assistant", content: [{ type: "text", text: `ok ${i}` }] });
    const [c] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, conversaId));
    await db.update(schema.conversas).set({ estado: { ...c.estado!, mensagens: msgs } }).where(eq(schema.conversas.id, conversaId));

    expect(await compactarConversa(conversaId, 29)).toBe(false); // a turn arrived meanwhile (30 ≠ 29)
    expect(await compactarConversa(conversaId, 30)).toBe(true);
    const [depois] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, conversaId));
    const novas = depois.estado!.mensagens as { content: { text: string }[] }[];
    expect(novas.length).toBeLessThan(30);
    expect(novas[0].content[0].text).toContain("Resumo do início da ligação");
    expect(depois.estado!.resumos).toBe(1);
  });
});
