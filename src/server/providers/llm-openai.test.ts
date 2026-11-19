import { describe, expect, it } from "vitest";

describe("Fala limpa para voz", () => {
  it("transforma lista em frase e tira quebras e marcações", async () => {
    const { limparFala } = await import("./llm-openai");
    expect(limparFala("Perfeito! Para amanhã temos:\n- Sexta-feira, 20/11 às 08:00\n- Sexta-feira, 20/11 às 08:30\n\nQual prefere?")).toBe(
      "Perfeito! Para amanhã temos: Sexta-feira, 20/11 às 08:00 ou Sexta-feira, 20/11 às 08:30. Qual prefere?",
    );
    expect(limparFala("**Claro!** Vou ver.\n\n1. Limpeza\n2. Clareamento\n3. Avaliação")).toBe("Claro! Vou ver. Limpeza, Clareamento ou Avaliação.");
    expect(limparFala("<think>hmm</think>Oi, tudo bem?")).toBe("Oi, tudo bem?");
  });
});
