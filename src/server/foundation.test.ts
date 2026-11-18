import { beforeAll, describe, expect, it } from "vitest";
import { novoBancoDeTeste } from "../../test/db";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { autenticar, criarConta, ErroConta } from "@/server/auth/conta";
import { obterAssinatura, resumoCobranca, trocarPlano, usoDoCiclo } from "@/server/billing/assinaturas";
import { pode } from "@/server/auth/session";
import {
  estadoFranquia,
  itensFatura,
  previsaoMinutos,
  somarMeses,
  totalCentavos,
  creditoProRata,
} from "@/lib/billing/ciclo";
import { getPlan } from "@/lib/pricing/plans";

let db: Db;
beforeAll(async () => {
  db = await novoBancoDeTeste();
});

describe("Conta e trial", () => {
  it("cria usuário, organização (dono) e trial de 7 dias", async () => {
    const { orgId } = await criarConta({ nome: "Ana", email: "Ana@Clinica.com", senha: "senhaforte1", empresa: "Clínica Sorriso", nicho: "clinica" });
    const a = await obterAssinatura(orgId);
    expect(a.planoId).toBe("teste");
    expect(a.status).toBe("trial");
    expect(Math.round((a.fimCiclo.getTime() - a.inicioCiclo.getTime()) / 86_400_000)).toBe(7);
  });

  it("não deixa duplicar e-mail e autentica normalizando", async () => {
    await expect(
      criarConta({ nome: "Ana", email: "ana@clinica.com", senha: "outrasenha1", empresa: "Xpto Ltda", nicho: "clinica" }),
    ).rejects.toBeInstanceOf(ErroConta);
    const r = await autenticar(" ANA@clinica.com ", "senhaforte1");
    expect(r.orgId).toBeTruthy();
    await expect(autenticar("ana@clinica.com", "errada")).rejects.toThrow("incorretos");
  });

  it("papéis: atendente não edita agente nem vê cobrança", () => {
    expect(pode("dono", "forcarPublicacao")).toBe(true);
    expect(pode("gestor", "forcarPublicacao")).toBe(false);
    expect(pode("atendente", "editarAgente")).toBe(false);
    expect(pode("financeiro", "verCobranca")).toBe(true);
    expect(pode("financeiro", "verLigacoes")).toBe(false);
  });
});

describe("Medição do ciclo", () => {
  it("separa minutos reais, pico e teste; isola organizações", async () => {
    const { orgId } = await criarConta({ nome: "Bia", email: "bia@resto.com", senha: "senhaforte1", empresa: "Cantina", nicho: "restaurante" });
    const { orgId: outra } = await criarConta({ nome: "Caio", email: "caio@imob.com", senha: "senhaforte1", empresa: "Imob", nicho: "imobiliaria" });
    const base = { agenteId: "a1", status: "encerrada" as const };
    await db.insert(schema.conversas).values([
      { ...base, orgId, canal: "telefone", minutosCobrados: 3 },
      { ...base, orgId, canal: "telefone", minutosCobrados: 2, pico: true },
      { ...base, orgId, canal: "teste_voz", teste: true, minutosCobrados: 4 },
      { ...base, orgId, canal: "teste_texto", teste: true, minutosCobrados: 9 }, // text tests never count
      { ...base, orgId: outra, canal: "telefone", minutosCobrados: 50 },
    ]);
    const a = await obterAssinatura(orgId);
    const uso = await usoDoCiclo(orgId, a.inicioCiclo, new Date(Date.now() + 1000));
    expect(uso).toEqual({ minutos: 3, minutosPico: 2, minutosTeste: 4 });
    const r = await resumoCobranca(orgId);
    expect(r.usadosFranquia).toBe(3);
  });

  it("trocar de plano inicia ciclo novo e credita pro-rata", async () => {
    const { orgId } = await criarConta({ nome: "Davi", email: "davi@x.com", senha: "senhaforte1", empresa: "Xpto Ltda", nicho: "clinica" });
    const t0 = new Date("2026-11-01T00:00:00Z");
    await trocarPlano(orgId, "start", "mensal", t0);
    const a = await obterAssinatura(orgId);
    expect(a.status).toBe("ativa");
    expect(a.fimCiclo.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    const { creditoProRataBrl } = await trocarPlano(orgId, "pro", "mensal", new Date("2026-11-16T00:00:00Z"));
    expect(creditoProRataBrl).toBeCloseTo(197 * (15 / 30), 1);
  });
});

describe("Regras de ciclo (puras)", () => {
  it("somarMeses respeita fim de mês", () => {
    expect(somarMeses(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(somarMeses(new Date("2028-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2028-02-29");
  });

  it("fatura: plano + excedente + pico; teste acima de 60 min entra na franquia", () => {
    const itens = itensFatura("start", "mensal", { minutos: 230, minutosPico: 5, minutosTeste: 70 });
    // franquia: 230 + (70-60) = 240 → 40 excedentes × 0,99 ; pico 5 × 1,98
    expect(itens.map((i) => i.totalCentavos)).toEqual([19700, 3960, 990]);
    expect(totalCentavos(itens)).toBe(19700 + 3960 + 990);
  });

  it("anual = 10× mensal e franquia de 12 meses", () => {
    const itens = itensFatura("pro", "anual", { minutos: 7000, minutosPico: 0, minutosTeste: 0 });
    expect(itens).toHaveLength(1);
    expect(itens[0].totalCentavos).toBe(497000);
  });

  it("estado da franquia: alerta, esgotada, trial e teto", () => {
    const u = (m: number) => ({ minutos: m, minutosPico: 0, minutosTeste: 0 });
    expect(estadoFranquia("start", "mensal", u(100), null)).toBe("ok");
    expect(estadoFranquia("start", "mensal", u(160), null)).toBe("alerta_80");
    expect(estadoFranquia("start", "mensal", u(200), null)).toBe("esgotada");
    expect(estadoFranquia("teste", "mensal", u(30), null)).toBe("esgotada");
    // teto R$ 250: 197 + 54×0,99 = 250,46 ≥ 250
    expect(estadoFranquia("start", "mensal", u(254), 250)).toBe("teto");
  });

  it("pro-rata e previsão", () => {
    const ini = new Date("2026-11-01T00:00:00Z");
    const fim = new Date("2026-12-01T00:00:00Z");
    expect(creditoProRata(getPlan("pro"), "mensal", ini, fim, new Date("2026-11-21T00:00:00Z"))).toBeCloseTo(165.67, 1);
    expect(previsaoMinutos(100, ini, fim, new Date("2026-11-11T00:00:00Z"))).toBe(300);
    // first hours of the cycle: pace measured over 3 days, never below what was already used
    expect(previsaoMinutos(47, ini, fim, new Date(ini.getTime() + 3 * 3_600_000))).toBe(Math.round((47 / 3) * ((fim.getTime() - ini.getTime()) / 86_400_000)));
    expect(previsaoMinutos(500, ini, fim, new Date(fim.getTime() + 86_400_000))).toBe(500);
  });
});
