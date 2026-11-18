import { describe, expect, it } from "vitest";
import { esperaExtraMs, juntar } from "./turno";

describe("Fim da vez do cliente", () => {
  it("responde na hora quando a frase está completa", () => {
    expect(esperaExtraMs("Vocês aceitam Unimed?")).toBe(0);
    expect(esperaExtraMs("Obrigado.")).toBe(0);
    expect(esperaExtraMs("Sim")).toBe(0);
  });
  it("espera quando a frase termina em conectivo, vírgula ou reticências", () => {
    expect(esperaExtraMs("Queria marcar uma consulta e")).toBeGreaterThanOrEqual(900);
    expect(esperaExtraMs("Meu nome é Maria,")).toBeGreaterThanOrEqual(900);
    expect(esperaExtraMs("É para a minha")).toBeGreaterThanOrEqual(900);
  });
  it("espera mais enquanto o cliente dita um número incompleto", () => {
    expect(esperaExtraMs("Meu CPF é 123.456")).toBe(1600);
    expect(esperaExtraMs("o telefone é 19 9 8")).toBe(1600);
    expect(esperaExtraMs("Meu CPF é 123.456.789-09")).toBeLessThan(900);
  });
  it("junta as partes na mesma fala", () => {
    expect(juntar(["Meu CPF é 123.456", "789-09 ."])).toBe("Meu CPF é 123.456 789-09.");
  });
});
