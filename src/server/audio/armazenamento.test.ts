import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Gravações no Supabase Storage", () => {
  it("envia, lê e apaga no bucket privado com a chave de serviço", async () => {
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "srv");
    const chamadas: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        chamadas.push({ url, init });
        return new Response(init.method === "GET" || !init.method ? new Uint8Array([1, 2, 3]) : "{}", { status: 200 });
      }),
    );
    const m = await import("./armazenamento");
    await m.salvarAudio("org1/conv1.wav", Buffer.from([1, 2, 3]));
    expect(chamadas[0].url).toBe("https://proj.supabase.co/storage/v1/object/gravacoes/org1/conv1.wav");
    expect(chamadas[0].init.headers).toMatchObject({ authorization: "Bearer srv", apikey: "srv", "x-upsert": "true" });
    expect([...(await m.lerAudio("org1/conv1.wav"))!]).toEqual([1, 2, 3]);
    expect(chamadas[1].url).toContain("/object/authenticated/gravacoes/org1/conv1.wav");
    await m.apagarAudio("org1/conv1.wav");
    expect(JSON.parse(String(chamadas[2].init.body))).toEqual({ prefixes: ["org1/conv1.wav"] });
    await expect(m.salvarAudio("../etc/passwd", Buffer.from([]))).rejects.toThrow(/inválida/);
  });
});
