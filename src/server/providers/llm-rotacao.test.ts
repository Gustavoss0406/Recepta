import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErroProvedor, paraOpenAI } from "./llm-openai";
import { _limparRotacao, classificarErro, ErroSemMotor, LlmRotativo, type Provedor } from "./llm-rotacao";

const prov = (id: string, modelos: string[]): Provedor => ({ id, baseURL: `https://${id}.test/v1`, chave: "x", modelos: async () => modelos, timeoutMs: 1000 });
const req = { modelo: "gratuito" as const, system: "s", tools: [{ name: "agendar", description: "", input_schema: { type: "object" as const, properties: {} } }], messages: [{ role: "user" as const, content: "oi" }] };

function resposta(corpo: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...headers } });
}

beforeEach(() => _limparRotacao());
afterEach(() => vi.unstubAllGlobals());

describe("Conversão Anthropic ↔ OpenAI", () => {
  it("tool_use vira tool_calls e tool_result vira role tool", () => {
    const m = paraOpenAI("sys", [
      { role: "user", content: [{ type: "text", text: "Cliente: oi" }] },
      { role: "assistant", content: [{ type: "text", text: "Vou ver." }, { type: "tool_use", id: "t1", name: "agendar", input: { nome: "Ana" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: '{"ok":true}' }] },
    ]);
    expect(m).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "Cliente: oi" },
      { role: "assistant", content: "Vou ver.", tool_calls: [{ id: "t1", type: "function", function: { name: "agendar", arguments: '{"nome":"Ana"}' } }] },
      { role: "tool", tool_call_id: "t1", content: '{"ok":true}' },
    ]);
  });
});

describe("Classificação de erros", () => {
  const agora = Date.UTC(2026, 10, 18, 10);
  it("cota diária pausa o provedor até o próximo dia UTC; 429 de modelo saturado pausa só o modelo", () => {
    expect(classificarErro(new ErroProvedor("x 429: Rate limit exceeded: free-models-per-day", 429), agora)).toMatchObject({ escopo: "provedor", ate: Date.UTC(2026, 10, 19) + 60_000 });
    expect(classificarErro(new ErroProvedor("x 429: Provider returned error", 429), agora)).toMatchObject({ escopo: "modelo" });
    expect(classificarErro(new ErroProvedor("x 429: slow down", 429, 5000), agora)).toEqual({ escopo: "provedor", ate: agora + 5000, motivo: "limite por minuto" });
    expect(classificarErro(new ErroProvedor("x 401", 401), agora).escopo).toBe("provedor");
    expect(classificarErro(new Error("timeout"), agora)).toMatchObject({ escopo: "modelo", ate: agora + 120_000 });
  });
});

describe("Rotação", () => {
  it("pula provedor limitado, usa o próximo e lembra da pausa", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        chamadas.push(url);
        if (url.startsWith("https://a.test")) return resposta({ error: { message: "slow down" } }, 429, { "retry-after": "30" });
        return resposta({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", function: { name: "agendar", arguments: '{"nome":"Ana"}' } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 3 } });
      }),
    );
    const llm = new LlmRotativo([prov("a", ["m1", "m2"]), prov("b", ["m3"])]);
    const r = await llm.turno(req);
    expect(r.stopReason).toBe("tool_use");
    expect(r.content[0]).toMatchObject({ type: "tool_use", name: "agendar", input: { nome: "Ana" } });
    expect(llm.ultimo).toBe("b/m3");
    expect(chamadas.filter((u) => u.startsWith("https://a.test"))).toHaveLength(1); // provider paused after the first 429

    await llm.turno(req);
    expect(chamadas.filter((u) => u.startsWith("https://a.test"))).toHaveLength(1);
  });

  it("ferramenta inventada pelo modelo conta como falha e tenta o próximo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("a.test")
          ? resposta({ choices: [{ message: { tool_calls: [{ id: "c", function: { name: "hackear", arguments: "{}" } }] }, finish_reason: "tool_calls" }] })
          : resposta({ choices: [{ message: { content: "Olá!" }, finish_reason: "stop" }] }),
      ),
    );
    const r = await new LlmRotativo([prov("a", ["m1"]), prov("b", ["m2"])]).turno(req);
    expect(r.content).toEqual([{ type: "text", text: "Olá!", citations: null }]);
  });

  it("todos fora → ErroSemMotor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta({ error: { message: "down" } }, 503)));
    await expect(new LlmRotativo([prov("a", ["m1"]), prov("b", ["m2"])]).turno(req)).rejects.toBeInstanceOf(ErroSemMotor);
  });
});

describe("Limites por modelo (Groq)", () => {
  it("limite por minuto ou por dia de um modelo pausa só aquele modelo", async () => {
    const { classificarErro } = await import("./llm-rotacao");
    const { ErroProvedor } = await import("./llm-openai");
    const tpm = classificarErro(new ErroProvedor("Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` on tokens per minute (TPM): Limit 8000", 429, 7000), 0);
    expect(tpm).toMatchObject({ escopo: "modelo", ate: 7000 });
    const tpd = classificarErro(new ErroProvedor("Rate limit reached for model `openai/gpt-oss-20b` on tokens per day (TPD)", 429), 0);
    expect(tpd.escopo).toBe("modelo");
    expect(classificarErro(new ErroProvedor("Too many requests", 429), 0).escopo).toBe("provedor");
  });
});
