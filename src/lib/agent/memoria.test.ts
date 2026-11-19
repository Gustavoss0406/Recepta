import { describe, expect, it } from "vitest";
import { contextoMemoria, extrairDados } from "./memoria";

describe("Memória do que o cliente disse", () => {
  it("pega nome e telefone das respostas, sem confundir com outras falas", () => {
    let m = extrairDados("Me diz seu nome, por favor?", "Gustavo");
    expect(m).toEqual({ nome: "Gustavo" });
    m = extrairDados("Qual seu telefone?", "47997784442", m);
    expect(m).toEqual({ nome: "Gustavo", telefone: "47997784442" });
    expect(extrairDados("Me diz seu nome?", "gustavo, já falei").nome).toBe("Gustavo");
    expect(extrairDados("Me diz seu nome?", "É a Ana Paula").nome).toBe("Ana Paula");
    expect(extrairDados("", "oi, meu nome é joão da silva e quero alugar").nome).toBe("João da Silva");
    expect(extrairDados("Me diz seu nome?", "comprar")).toEqual({});
    expect(extrairDados("Quer comprar ou alugar?", "Gustavo")).toEqual({}); // not asked for a name
    expect(extrairDados("", "(19) 99999-1234 é meu número").telefone).toBe("(19) 99999-1234");
  });

  it("mostra o que já sabe e sugere o número de quem liga", () => {
    expect(contextoMemoria({ nome: "Gustavo" }, "+5547997784442")).toContain("telefone de quem está ligando: +5547997784442");
    expect(contextoMemoria({}, null)).toBeNull();
  });
});
