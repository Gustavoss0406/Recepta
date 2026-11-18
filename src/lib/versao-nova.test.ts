import { describe, expect, it } from "vitest";
import { ehVersaoAntiga } from "./versao-nova";

describe("Versão antiga da página", () => {
  it("reconhece a ação de servidor de um deploy anterior", () => {
    expect(ehVersaoAntiga(new Error('Server Action "60249b39a39af0dd8c27c798e0dd9f239a88758c53" was not found on the server. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action'))).toBe(true);
    expect(ehVersaoAntiga(new Error("Agente não encontrado"))).toBe(false);
    expect(ehVersaoAntiga(undefined)).toBe(false);
  });
});
