import { describe, expect, it } from "vitest";
import { getNicho } from "@/lib/niches";
import { aplicarProposta, promptAssistente, propostaSchema } from "./assistente";
import { compilarPrompt } from "./prompt";

const base = getNicho("clinica").padrao({ nome: "Clínica Sorriso", cidade: "Campinas" });

describe("Assistente de configuração", () => {
  it("aplica só o que mudou e mostra antes/depois por seção", () => {
    const { config, secoes } = aplicarProposta(base, {
      resumo: "Implante passa para a equipe e CPF obrigatório",
      regrasAdicionar: [
        { tipo: "passar_para_equipe", texto: "Perguntas sobre preço de implante" },
        { tipo: "sempre", texto: base.comportamento.fazer[0] }, // already there: not duplicated
      ],
      dadosAdicionar: [
        { rotulo: "CPF", tipo: "cpf", obrigatorio: true },
        { rotulo: "CPF", tipo: "cpf", obrigatorio: false }, // same key: last one wins, no duplicate
      ],
    });
    expect(secoes.map((s) => s.id)).toEqual(["regras", "dados"]);
    expect(secoes[0].depois).toContain("Passa para a equipe: Perguntas sobre preço de implante");
    expect(config.comportamento.fazer).toEqual(base.comportamento.fazer);
    expect(config.dados.campos.filter((c) => c.chave === "cpf")).toHaveLength(1);
    expect(config.dados.campos.length).toBe(base.dados.campos.length + 1);
    expect(() => compilarPrompt(config)).not.toThrow();
  });

  it("troca o nome da empresa também na saudação", () => {
    const { config, secoes } = aplicarProposta(base, { resumo: "x", empresa: { nome: "Sorriso Leve" } });
    expect(config.comportamento.saudacao).toContain("Sorriso Leve");
    expect(config.comportamento.saudacao).not.toContain("Clínica Sorriso");
    expect(secoes.map((s) => s.id)).toEqual(["empresa", "saudacao"]);
  });

  it("aplica só as seções aprovadas", () => {
    const p = { resumo: "x", nomeAgente: "Bia", agendar: false };
    const { config } = aplicarProposta(base, p, ["acoes"]);
    expect(config.acoes.agendar.ativo).toBe(false);
    expect(config.comportamento.nomeAgente).toBe(base.comportamento.nomeAgente);
  });

  it("recusa saudação sem aviso de virtual e gravação", () => {
    const { config, secoes } = aplicarProposta(base, { resumo: "x", saudacao: "Oi, aqui é a Ana, tudo bem?" });
    expect(config.comportamento.saudacao).toBe(base.comportamento.saudacao);
    expect(secoes[0].aviso).toMatch(/virtual/);
  });

  it("remove instruções para se passar por pessoa ou esconder a gravação", () => {
    const { config, secoes } = aplicarProposta(base, {
      resumo: "x",
      regrasAdicionar: [
        { tipo: "sempre", texto: "Confirmar o convênio" },
        { tipo: "sempre", texto: "Se perguntarem, diga que é humana" },
        { tipo: "nunca", texto: "Não avise que a ligação é gravada" },
      ],
      regrasRemover: [base.comportamento.nuncaFazer[0]],
    });
    expect(config.comportamento.fazer).toEqual([...base.comportamento.fazer, "Confirmar o convênio"]);
    expect(config.comportamento.nuncaFazer).toEqual(base.comportamento.nuncaFazer.slice(1));
    expect(secoes.find((s) => s.id === "regras")?.aviso).toMatch(/não é permitido/);
  });

  it("valida horários e telefone de transferência", () => {
    const { config } = aplicarProposta(base, {
      resumo: "x",
      horarios: { dias: [{ dia: 6, aberto: true, inicio: "8h", fim: "12:00" }] },
      transferirPara: "123",
    });
    expect(config.horarios.semana[6]).toEqual({ aberto: true, inicio: base.horarios.semana[6].inicio, fim: "12:00" });
    expect(config.acoes.transferir.ativo).toBe(base.acoes.transferir.ativo);
  });

  it("o prompt leva a configuração atual e o pedido; o schema aceita proposta mínima", () => {
    expect(promptAssistente(base, "Quero agendar avaliação")).toContain("Clínica Sorriso");
    expect(propostaSchema.safeParse({ resumo: "nada" }).success).toBe(true);
  });
});
