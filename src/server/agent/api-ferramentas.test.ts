import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { novoBancoDeTeste } from "../../../test/db";
import { criarConta } from "@/server/auth/conta";
import { ferramentaApiSchema } from "@/lib/agent/api-ferramenta";
import { executarApi, salvarCredencialApi } from "./api-ferramentas";

vi.mock("@/server/crawler/seguranca", () => ({ urlPublicaSegura: async (u: string) => new URL(u) }));

const f = ferramentaApiSchema.parse({
  id: "xyz98765",
  nome: "criar_lead",
  descricao: "Cria um lead no sistema da empresa",
  nivel: "registrar",
  metodo: "POST",
  url: "https://api.loja.com/leads",
  parametros: [{ nome: "nome", descricao: "Nome", obrigatorio: true }],
  campos: ["id"],
});
let orgId: string;
beforeAll(async () => {
  await novoBancoDeTeste();
  ({ orgId } = await criarConta({ nome: "Ana", email: "api@x.com", senha: "senhaforte1", empresa: "Loja", nicho: "clinica" }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Executar ferramenta de API", () => {
  it("registrar sem confirmação do cliente é recusado; em teste é simulado", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await executarApi(orgId, f, { nome: "Ana" })).toMatchObject({ ok: false });
    expect(await executarApi(orgId, f, { nome: "Ana", cliente_confirmou: true }, { teste: true })).toMatchObject({ ok: true, simulado: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("envia a credencial criptografada e devolve só os campos liberados", async () => {
    await salvarCredencialApi(orgId, f.id, "Authorization", "Bearer segredo");
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 7, interno: "x" }), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const r = await executarApi(orgId, f, { nome: "Ana", cliente_confirmou: true });
    expect(r).toEqual({ ok: true, status: 201, dados: { id: 7 } });
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer segredo");
    expect(init.body).toBe('{"nome":"Ana"}');
  });

  it("erros viram mensagens simples", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    expect(await executarApi(orgId, { ...f, nivel: "consultar" }, { nome: "x" })).toMatchObject({ ok: false, erro: "O sistema recusou a credencial" });
  });
});
