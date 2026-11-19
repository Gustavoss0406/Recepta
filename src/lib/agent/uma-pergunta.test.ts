import { describe, expect, it } from "vitest";
import { umaPergunta } from "./uma-pergunta";

describe("Uma pergunta por resposta", () => {
  it("corta depois da primeira pergunta", () => {
    expect(umaPergunta(["Ah, entendi! Tem imóveis pros dois gostos. Tem alguma região em mente? E o preço? Me diz seu nome?"])).toEqual([
      "Ah, entendi! Tem imóveis pros dois gostos. Tem alguma região em mente?",
    ]);
    expect(umaPergunta(["Deixa eu ver aqui…", "Achei dois. Quer ir ver? Ou prefere outro bairro?"])).toEqual(["Deixa eu ver aqui…", "Achei dois. Quer ir ver?"]);
    expect(umaPergunta(["Pronto, marcado."])).toEqual(["Pronto, marcado."]);
  });
});
