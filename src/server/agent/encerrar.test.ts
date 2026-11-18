import { beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { novoBancoDeTeste } from "../../../test/db";
import { criarConta } from "@/server/auth/conta";
import { criarAgente } from "./agentes";
import { podeEncerrar } from "./ferramentas";
import { iniciarConversa, responder } from "./runtime";
import { setLlm, type Llm, type TurnoReq } from "@/server/providers/llm";

describe("Trava de encerramento", () => {
  it("só encerra com despedida, 'não' depois de 'mais alguma coisa' ou pedido já atendido", () => {
    expect(podeEncerrar("Mello", "Me diz seu nome, por favor?")).toBe(false);
    expect(podeEncerrar("Para comprar mesmo", "")).toBe(false);
    expect(podeEncerrar("Obrigado, tchau!", "")).toBe(true);
    expect(podeEncerrar("Era só isso", "")).toBe(true);
    expect(podeEncerrar("Não, obrigado", "Posso ajudar em mais alguma coisa?")).toBe(true);
    expect(podeEncerrar("não", "Qual é o seu nome?")).toBe(false);
    expect(podeEncerrar("ok", "Alguém da equipe vai te retornar.", true)).toBe(true);
  });

  /** Reproduces a real call: the model tried to hang up right after the caller said their name. */
  class LlmApressado implements Llm {
    readonly real = true;
    async turno(req: TurnoReq) {
      const uso = { input: 10, cached: 0, output: 5 };
      const ultimo = req.messages.at(-1)!.content as Anthropic.ContentBlockParam[];
      const res = ultimo.find((b) => b.type === "tool_result") as Anthropic.ToolResultBlockParam | undefined;
      if (res) return { content: [{ type: "text", text: "Prazer! Qual tipo de imóvel você procura?", citations: null } as Anthropic.ContentBlock], stopReason: "end_turn", uso };
      return { content: [{ type: "tool_use", id: "t1", name: "encerrar_ligacao", input: {} } as unknown as Anthropic.ContentBlock], stopReason: "tool_use", uso };
    }
    async estruturado<T>(): Promise<{ dados: T; uso: { input: number; cached: number; output: number } }> {
      throw new Error("não usado");
    }
  }

  let orgId: string;
  let agenteId: string;
  beforeAll(async () => {
    await novoBancoDeTeste();
    setLlm(new LlmApressado());
    ({ orgId } = await criarConta({ nome: "Ana", email: "trava@x.com", senha: "senhaforte1", empresa: "Imobiliária", nicho: "imobiliaria" }));
    agenteId = (await criarAgente(orgId, "imobiliaria", { nome: "Imobiliária" })).id;
  });

  it("recusa o encerramento no meio da conversa e ela continua", async () => {
    const { conversaId } = await iniciarConversa({ orgId, agenteId, canal: "teste_texto", alvo: "rascunho" });
    const r = await responder(conversaId, "Mello");
    expect(r.encerrar).toBe(false);
    expect(r.acoes[0]).toMatchObject({ nome: "encerrar_ligacao", resultado: { ok: false } });
    expect(r.falas).toEqual(["Prazer! Qual tipo de imóvel você procura?"]);
  });
});
