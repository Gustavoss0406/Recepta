import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { novoBancoDeTeste } from "../../../test/db";

beforeAll(async () => {
  await novoBancoDeTeste();
});
afterAll(() => {
  vi.unstubAllGlobals();
  delete process.env.UNSPLASH_ACCESS_KEY;
});

describe("fotos do Unsplash", () => {
  it("sem chave não chama a API (cards usam as fotos locais)", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const { fotoUnsplash } = await import("./unsplash");
    expect(await fotoUnsplash("academia")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("com a Access Key: busca, registra o download, guarda crédito e usa o cache depois", async () => {
    process.env.UNSPLASH_ACCESS_KEY = "chave-teste";
    const f = vi.fn(async (url: string) => {
      if (url.includes("/search/photos"))
        return Response.json({ results: [{ urls: { raw: "https://images.unsplash.com/photo-1?ixid=x" }, user: { name: "Ana Lima", links: { html: "https://unsplash.com/@ana" } }, links: { html: "https://unsplash.com/photos/1", download_location: "https://api.unsplash.com/photos/1/download?ixid=x" }, alt_description: "gym" }] });
      return Response.json({ url: "ok" });
    });
    vi.stubGlobal("fetch", f);
    const { fotoUnsplash } = await import("./unsplash");
    const foto = await fotoUnsplash("academia");
    expect(foto).toMatchObject({ autor: "Ana Lima", autorUrl: "https://unsplash.com/@ana?utm_source=recepta&utm_medium=referral" });
    expect(foto!.url).toContain("images.unsplash.com/photo-1");
    const chamadas = f.mock.calls.map((c) => String(c[0]));
    expect(chamadas.some((u) => u.includes("/photos/1/download"))).toBe(true);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("authorization")).toBe("Client-ID chave-teste");
    f.mockClear();
    expect((await fotoUnsplash("academia"))?.autor).toBe("Ana Lima");
    expect(f).not.toHaveBeenCalled();
  });
});
