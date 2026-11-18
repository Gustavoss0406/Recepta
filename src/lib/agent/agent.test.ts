import { describe, expect, it } from "vitest";
import { agentConfigSchema, saudacaoTemAviso } from "./config";
import { compilarPrompt } from "./prompt";
import { mascarar } from "./mask";
import { NICHOS_DEF } from "@/lib/niches";

describe("Nichos", () => {
  for (const n of Object.values(NICHOS_DEF)) {
    it(`${n.id}: padrão válido, com aviso de atendimento virtual e 12 cenários`, () => {
      const cfg = n.padrao({ nome: "Empresa Teste", cidade: "Campinas" });
      expect(() => agentConfigSchema.parse(cfg)).not.toThrow();
      expect(saudacaoTemAviso(cfg.comportamento.saudacao)).toBe(true);
      expect(n.cenarios).toHaveLength(12);
      expect(new Set(n.cenarios.map((c) => c.id)).size).toBe(12);
      expect(n.cenarios.some((c) => c.severidade === "critico")).toBe(true);
    });
  }
});

describe("compilarPrompt", () => {
  const base = NICHOS_DEF.clinica.padrao({ nome: "Clínica Sorriso", cidade: "Campinas" });

  it("é determinístico", () => {
    expect(compilarPrompt(base)).toBe(compilarPrompt(structuredClone(base)));
  });

  it("inclui empresa, horários, ferramentas e regras de voz", () => {
    const p = compilarPrompt(base);
    expect(p).toContain("Clínica Sorriso, em Campinas");
    expect(p).toContain("Sábado: 08:00 às 12:00");
    expect(p).toContain("Domingo: fechado");
    expect(p).toContain("`consultar_horarios`");
    expect(p).toContain("`encerrar_ligacao`");
    expect(p).toContain("Nunca repita em voz alta números completos de CPF");
    expect(p).toContain("Dar diagnóstico ou orientação médica");
  });

  it("desligar uma ação remove a instrução da ferramenta", () => {
    const sem = structuredClone(base);
    sem.acoes.agendar.ativo = false;
    expect(compilarPrompt(sem)).not.toContain("`agendar`");
  });

  it("recusa saudação sem aviso de atendimento virtual e gravação", () => {
    const ruim = structuredClone(base);
    ruim.comportamento.saudacao = "Clínica Sorriso, bom dia!";
    expect(() => compilarPrompt(ruim)).toThrow(/recepcionista virtual/);
  });

  it("aceita aviso reescrito", () => {
    expect(saudacaoTemAviso("Oi! Sou a assistente virtual da loja e esta conversa é gravada.")).toBe(true);
    expect(saudacaoTemAviso("Ligação gravada. Eu sou uma IA.")).toBe(true);
  });
});

describe("Mascaramento LGPD", () => {
  it("mascara CPF com e sem pontuação", () => {
    expect(mascarar("meu cpf é 123.456.789-09")).toBe("meu cpf é •••.•••.•••-09");
    expect(mascarar("cpf 12345678909 ok")).toBe("cpf •••.•••.•••-09 ok");
  });
  it("mascara cartão mantendo os 4 finais", () => {
    expect(mascarar("cartão 4111 1111 1111 1234")).toBe("cartão •••• •••• •••• 1234");
  });
  it("não mexe em datas, horários e valores", () => {
    const t = "Dia 24/11 às 14:30, valor R$ 1.290,00, telefone (11) 98765-4321";
    expect(mascarar(t)).toBe(t);
  });
});
