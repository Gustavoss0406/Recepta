import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { novoBancoDeTeste } from "../../../test/db";
import { getDb, schema } from "@/db/client";
import { criarConta } from "@/server/auth/conta";
import { cifrar } from "@/server/cripto";
import { setLlm, type Llm, type TurnoReq } from "@/server/providers/llm";
import { criarAgente } from "./agentes";
import { contextoCliente, identificarCliente } from "./identificar";
import { iniciarConversa, responder } from "./runtime";

let orgId: string;
let agenteId: string;
const pedidos: TurnoReq[] = [];
class LlmEco implements Llm {
  readonly real = true;
  async turno(req: TurnoReq) {
    pedidos.push(req);
    return { content: [{ type: "text", text: "Falo com a Maria?", citations: null } as Anthropic.ContentBlock], stopReason: "end_turn", uso: { input: 1, cached: 0, output: 1 } };
  }
  async estruturado<T>(): Promise<{ dados: T; uso: { input: number; cached: number; output: number } }> {
    throw new Error("não usado");
  }
}

beforeAll(async () => {
  await novoBancoDeTeste();
  setLlm(new LlmEco());
  ({ orgId } = await criarConta({ nome: "Ana", email: "ident@x.com", senha: "senhaforte1", empresa: "Clínica", nicho: "clinica" }));
  agenteId = (await criarAgente(orgId, "clinica", { nome: "Clínica" })).id;
  // an earlier real call from the same number, written in another format
  await getDb().insert(schema.conversas).values({ orgId, agenteId, canal: "telefone", teste: false, de: "(19) 99999-1234", status: "encerrada", resultado: "resolvido", resumo: "Agendou limpeza para 12/11." });
});
afterEach(() => vi.unstubAllGlobals());

describe("Identificar quem liga", () => {
  it("acha ligações anteriores pelo final do número, em qualquer formato", async () => {
    const r = await identificarCliente(orgId, "+55 19 99999-1234");
    expect(r?.ligacoes).toEqual([{ quando: expect.any(String), resultado: "resolvido", resumo: "Agendou limpeza para 12/11." }]);
    expect(await identificarCliente(orgId, "+55 11 98888-0000")).toBeNull();
    expect(await identificarCliente(orgId, "123")).toBeNull();
  });

  it("junta HubSpot e Pipedrive conectados; CRM lento ou com erro não atrapalha", async () => {
    const db = getDb();
    await db.insert(schema.integracoes).values([
      { orgId, tipo: "hubspot", status: "conectado", credenciais: cifrar(JSON.stringify({ token: "pat" })) },
      { orgId, tipo: "pipedrive", status: "conectado", credenciais: cifrar(JSON.stringify({ token: "pd" })) },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("hubapi.com"))
          return Response.json({ results: [{ id: "1", properties: { firstname: "Maria", lastname: "Souza", phone: "+5519999991234", lifecyclestage: "customer" } }] });
        if (url.includes("/persons/search")) return Response.json({ data: { items: [{ item: { id: 9, name: "Maria Souza", phones: ["19 99999-1234"] } }] } });
        if (url.includes("/deals")) return Response.json({ data: [{ title: "Implante", status: "open", value: 5000, currency: "BRL" }] });
        return new Response("x", { status: 500 });
      }),
    );
    const r = (await identificarCliente(orgId, "19999991234"))!;
    expect(r.nome).toBe("Maria Souza");
    expect(r.crm.map((x) => x.fonte).sort()).toEqual(["HubSpot", "Pipedrive"]);
    const ctx = contextoCliente(r);
    expect(ctx).toContain("provavelmente Maria Souza");
    expect(ctx).toContain("Negócio aberto: Implante");
    expect(ctx).toMatch(/confirme o nome/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    expect((await identificarCliente(orgId, "19999991234"))?.crm).toEqual([]); // history still there
  });

  it("a primeira resposta da ligação já recebe quem está ligando", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    const { conversaId } = await iniciarConversa({ orgId, agenteId, canal: "teste_texto", alvo: "rascunho", de: "19 99999-1234" });
    await responder(conversaId, "Oi, bom dia");
    const primeira = JSON.stringify(pedidos.at(-1)!.messages[0]);
    expect(primeira).toContain("Cliente reconhecido pelo telefone");
    expect(primeira).toContain("Agendou limpeza");
    expect(pedidos.at(-1)!.tools.map((t) => t.name)).toContain("consultar_cadastro_cliente");
  });
});
