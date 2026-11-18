import { beforeAll, describe, expect, it } from "vitest";
import { novoBancoDeTeste } from "../../../../test/db";
import { getDb, schema } from "@/db/client";
import { criarConta } from "@/server/auth/conta";
import { criarAgente } from "@/server/agent/agentes";
import { sha256 } from "@/server/auth/tokens";
import { POST } from "./route";

let agenteId: string;
const chamar = (corpo: unknown, chave = "Bearer rk_mcp1.seg") =>
  POST(new Request("http://x/api/mcp", { method: "POST", headers: { authorization: chave, "content-type": "application/json" }, body: JSON.stringify(corpo) }));

beforeAll(async () => {
  await novoBancoDeTeste();
  const { orgId } = await criarConta({ nome: "Ana", email: "mcp@x.com", senha: "senhaforte1", empresa: "Clínica", nicho: "clinica" });
  agenteId = (await criarAgente(orgId, "clinica", { nome: "Clínica" })).id;
  await getDb().insert(schema.chavesApi).values({ orgId, nome: "t", prefixo: "rk_mcp1", hash: sha256("seg") });
  // another company's receptionist must stay invisible
  const outra = await criarConta({ nome: "Bia", email: "mcp2@x.com", senha: "senhaforte1", empresa: "Outra", nicho: "clinica" });
  await criarAgente(outra.orgId, "clinica", { nome: "Outra" });
});

describe("Servidor MCP", () => {
  it("exige chave de API", async () => {
    expect((await chamar({ jsonrpc: "2.0", id: 1, method: "ping" }, "")).status).toBe(401);
  });

  it("inicializa, lista ferramentas e ignora notificações", async () => {
    const r = await (await chamar({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
    expect(r.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "recepta" }, capabilities: { tools: {} } });
    expect((await chamar({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    const l = await (await chamar({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    expect(l.result.tools.map((t: { name: string }) => t.name)).toContain("testar_recepcionista");
  });

  it("só enxerga a própria empresa e devolve erros como resultado", async () => {
    const r = await (await chamar({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "listar_recepcionistas", arguments: {} } })).json();
    expect(r.result.structuredContent.itens.map((a: { id: string }) => a.id)).toEqual([agenteId]);
    const e = await (await chamar({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "ver_ligacao", arguments: { ligacao_id: "nao-existe" } } })).json();
    expect(e.result.isError).toBe(true);
    const d = await (await chamar({ jsonrpc: "2.0", id: 5, method: "metodo/x" })).json();
    expect(d.error.code).toBe(-32601);
  });
});
