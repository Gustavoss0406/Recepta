import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { novoBancoDeTeste } from "../../../test/db";
import { schema, type Db } from "@/db/client";
import { criarConta } from "@/server/auth/conta";
import { criarAgente, publicar } from "@/server/agent/agentes";
import { setLlm, type EstruturadoReq, type Llm } from "@/server/providers/llm";
import { executarCaso, garantirCasosPadrao, rodarGatePublicacao } from "./suite";

/** Agent always answers politely; the judge approves unless the criterion mentions "pronto-socorro". */
class LlmJuiz implements Llm {
  readonly real = true;
  async turno() {
    return { content: [{ type: "text", text: "Claro, posso ajudar.", citations: null } as Anthropic.ContentBlock], stopReason: "end_turn", uso: { input: 100, cached: 0, output: 10 } };
  }
  async estruturado<T>(req: EstruturadoReq<T>) {
    const shape = Object.keys((req.schema as unknown as { shape: Record<string, unknown> }).shape ?? {});
    const uso = { input: 50, cached: 0, output: 10 };
    if (shape.includes("aprovado")) return { dados: { aprovado: !req.prompt.includes("pronto-socorro"), justificativa: "teste" } as T, uso };
    if (shape.includes("fala")) return { dados: { fala: "Olá", terminou: req.prompt.includes("Agente: Claro") } as T, uso };
    return {
      dados: { resumo: "r", motivo: "m", resultado: "resolvido", dados: {}, sucesso: true, justificativa: "j", sentimento: "neutro" } as T,
      uso,
    };
  }
}

let db: Db;
let orgId: string;
let agenteId: string;
beforeAll(async () => {
  db = await novoBancoDeTeste();
  setLlm(new LlmJuiz());
  ({ orgId } = await criarConta({ nome: "Gil", email: "gil@clinica.com", senha: "senhaforte1", empresa: "Clínica Gil", nicho: "clinica" }));
  agenteId = (await criarAgente(orgId, "clinica", { nome: "Clínica Gil" })).id;
});
afterAll(() => setLlm(undefined));

describe("Suíte e trava de publicação", () => {
  it("cria os 12 cenários do nicho uma única vez", async () => {
    await garantirCasosPadrao(orgId, agenteId);
    await garantirCasosPadrao(orgId, agenteId);
    expect(await db.select().from(schema.casosTeste).where(eq(schema.casosTeste.agenteId, agenteId))).toHaveLength(12);
  });

  it("execução probabilística grava a taxa de aprovação", async () => {
    const [caso] = await db.select().from(schema.casosTeste).where(eq(schema.casosTeste.nome, "Pede para falar com uma pessoa"));
    const ex = await executarCaso(orgId, caso.id, 3);
    expect(ex.rodadas).toBe(3);
    expect(ex.aprovadas).toBe(3);
  });

  it("teste crítico reprovado bloqueia; gestor não força; dono força e fica registrado", async () => {
    const gate = await rodarGatePublicacao(orgId, agenteId);
    expect(gate.aprovado).toBe(false);
    expect(gate.falhasCriticas.map((f) => f.caso)).toContain("Sintoma de urgência");
    await expect(publicar(orgId, agenteId, { id: "u1", papel: "gestor" }, { gate })).rejects.toThrow(/bloqueada/);
    await expect(publicar(orgId, agenteId, { id: "u1", papel: "gestor" }, { gate, forcar: true })).rejects.toThrow(/Só o Dono/);
    const v = await publicar(orgId, agenteId, { id: "u2", papel: "dono" }, { gate, forcar: true });
    expect(v.forcada).toBe(true);
    const [log] = await db.select().from(schema.auditoria).where(eq(schema.auditoria.acao, "agente.publicado_forcado"));
    expect(log.usuarioId).toBe("u2");
  });
});
