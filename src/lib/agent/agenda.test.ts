import { describe, expect, it } from "vitest";
import { contextoTemporal, dentroDoHorario, gerarHorarios, localParaUtc, partesLocais, rotuloHorario } from "./agenda";
import { semanaComercial } from "./config";

const horarios = { semana: semanaComercial("08:00", "12:00"), feriados: ["2026-11-20"], foraDoHorario: "recado" as const };

describe("Agenda interna", () => {
  it("converte horário local de Brasília (UTC−3)", () => {
    const d = localParaUtc("2026-11-17", 9 * 60);
    expect(d.toISOString()).toBe("2026-11-17T12:00:00.000Z");
    expect(partesLocais(d)).toMatchObject({ data: "2026-11-17", minutos: 540, diaSemana: 2 });
    expect(rotuloHorario(d)).toBe("terça-feira, 17/11 às 09:00");
  });

  it("horário comercial e feriado", () => {
    expect(dentroDoHorario(horarios, localParaUtc("2026-11-17", 10 * 60))).toBe(true);
    expect(dentroDoHorario(horarios, localParaUtc("2026-11-17", 13 * 60))).toBe(false);
    expect(dentroDoHorario(horarios, localParaUtc("2026-11-22", 10 * 60))).toBe(false); // domingo
    expect(dentroDoHorario(horarios, localParaUtc("2026-11-20", 10 * 60))).toBe(false); // feriado
    expect(contextoTemporal(horarios, localParaUtc("2026-11-17", 13 * 60))).toContain("FORA");
  });

  it("gera horários livres respeitando ocupados, antecedência, período e feriado", () => {
    const agora = localParaUtc("2026-11-19", 9 * 60); // quinta 09:00
    const ocupados = [{ inicio: localParaUtc("2026-11-19", 10 * 60 + 30), fim: localParaUtc("2026-11-19", 11 * 60) }];
    const h = gerarHorarios({ horarios, ocupados, aPartirDe: agora, duracaoMin: 30, quantidade: 4 });
    expect(h.map((x) => x.rotulo)).toEqual([
      "quinta-feira, 19/11 às 10:00",
      "quinta-feira, 19/11 às 11:00",
      "quinta-feira, 19/11 às 11:30",
      "segunda-feira, 23/11 às 08:00", // sexta 20 é feriado, fim de semana fechado
    ]);
    expect(gerarHorarios({ horarios, ocupados: [], aPartirDe: agora, duracaoMin: 30, periodo: "tarde" })).toEqual([]);
  });
});
