import { describe, expect, it } from "vitest";
import { candidatosDeSite } from "./crawl";

describe("qualquer formato de site", () => {
  it.each([
    ["larimoveis.com.br", "https://larimoveis.com.br"],
    ["https://larimoveis.com.br/", "https://larimoveis.com.br"],
    [" HTTPS://WWW.LarImoveis.com.br ", "https://www.larimoveis.com.br"],
    ["www.larimoveis.com.br/", "https://www.larimoveis.com.br"],
    ["htps//larimoveis.com.br", "https://larimoveis.com.br"],
    ["http://larimoveis.com.br", "https://larimoveis.com.br"],
    ["larimoveis .com.br", "https://larimoveis.com.br"],
    ["site: larimoveis.com.br.", "https://larimoveis.com.br"],
    ["larimoveis.com.br/contato/", "https://larimoveis.com.br/contato"],
  ])("%s", (entrada, primeiro) => {
    const c = candidatosDeSite(entrada);
    expect(c[0]).toBe(primeiro);
    expect(c.some((x) => x.startsWith("http://"))).toBe(true);
    expect(c.some((x) => /\/\/www\.|\/\/larimoveis/.test(x))).toBe(true);
  });
  it("rejeita o que não é site", () => {
    expect(candidatosDeSite("não tenho")).toEqual([]);
    expect(candidatosDeSite("")).toEqual([]);
  });
});
