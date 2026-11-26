import { afterEach, describe, expect, it, vi } from "vitest";
import { criarMotor } from "./motor-cliente";

const resposta = (texto: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: texto }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("motor do cliente", () => {
  it.each([
    ["openai", "https://api.openai.com/v1/chat/completions", "gpt-5.1-mini"],
    ["gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "gemini-3-flash"],
    ["deepseek", "https://api.deepseek.com/v1/chat/completions", "deepseek-chat"],
    ["opencode", "https://opencode.ai/zen/v1/chat/completions", "kimi-k2"],
  ] as const)("%s usa o endpoint, o modelo e a chave do cliente", async (id, url, modelo) => {
    const f = vi.fn(async () => resposta("ok"));
    vi.stubGlobal("fetch", f);
    const r = await criarMotor(id, "", "sk-cliente").turno({ modelo: "claude-haiku-5-5", system: "s", messages: [{ role: "user", content: "oi" }], tools: [] });
    expect(r.content[0]).toMatchObject({ type: "text", text: "ok" });
    const [u, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(u).toBe(url);
    expect(JSON.parse(String(init.body)).model).toBe(modelo);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk-cliente");
  });
});
