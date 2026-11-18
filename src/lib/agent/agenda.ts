import type { AgentConfig } from "./config";

/** America/Sao_Paulo has no DST since 2019: fixed UTC−3. */
const OFFSET_MIN = -180;
const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export interface PartesLocais {
  ano: number;
  mes: number; // 1-12
  dia: number;
  diaSemana: number; // 0 = domingo
  minutos: number; // minutes since local midnight
  data: string; // YYYY-MM-DD
}

export function partesLocais(d: Date): PartesLocais {
  const l = new Date(d.getTime() + OFFSET_MIN * 60_000);
  const ano = l.getUTCFullYear();
  const mes = l.getUTCMonth() + 1;
  const dia = l.getUTCDate();
  return {
    ano,
    mes,
    dia,
    diaSemana: l.getUTCDay(),
    minutos: l.getUTCHours() * 60 + l.getUTCMinutes(),
    data: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
  };
}

export function hhmmParaMin(h: string): number {
  const [a, b] = h.split(":").map(Number);
  return a * 60 + (b || 0);
}

/** Local (São Paulo) date + minutes → UTC instant. */
export function localParaUtc(data: string, minutos: number): Date {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 0, minutos) - OFFSET_MIN * 60_000);
}

export function rotuloHorario(d: Date): string {
  const p = partesLocais(d);
  const h = Math.floor(p.minutos / 60);
  const mm = p.minutos % 60;
  return `${DIAS_SEMANA[p.diaSemana]}, ${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")} às ${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function dentroDoHorario(h: AgentConfig["horarios"], agora: Date): boolean {
  const p = partesLocais(agora);
  if (h.feriados.includes(p.data)) return false;
  const d = h.semana[p.diaSemana];
  return d.aberto && p.minutos >= hhmmParaMin(d.inicio) && p.minutos < hhmmParaMin(d.fim);
}

export interface Horario {
  inicio: string; // ISO UTC
  rotulo: string;
}

export function gerarHorarios(opts: {
  horarios: AgentConfig["horarios"];
  ocupados: { inicio: Date; fim: Date }[];
  aPartirDe: Date;
  duracaoMin: number;
  periodo?: "manha" | "tarde" | "noite";
  dataPreferida?: string;
  quantidade?: number;
  diasMax?: number;
}): Horario[] {
  const { horarios, ocupados, aPartirDe, duracaoMin } = opts;
  const quantidade = opts.quantidade ?? 4;
  const passo = Math.min(Math.max(duracaoMin, 15), 60);
  const minimo = aPartirDe.getTime() + 60 * 60_000; // at least 1h ahead
  const out: Horario[] = [];
  const hoje = partesLocais(aPartirDe).data;
  const inicioBusca = opts.dataPreferida && opts.dataPreferida > hoje ? opts.dataPreferida : hoje;

  for (let i = 0; i < (opts.diasMax ?? 14) && out.length < quantidade; i++) {
    const base = localParaUtc(inicioBusca, 12 * 60);
    const data = partesLocais(new Date(base.getTime() + i * 86_400_000)).data;
    const dow = partesLocais(localParaUtc(data, 12 * 60)).diaSemana;
    const dia = horarios.semana[dow];
    if (!dia.aberto || horarios.feriados.includes(data)) continue;
    for (let m = hhmmParaMin(dia.inicio); m + duracaoMin <= hhmmParaMin(dia.fim) && out.length < quantidade; m += passo) {
      if (opts.periodo === "manha" && m >= 12 * 60) continue;
      if (opts.periodo === "tarde" && (m < 12 * 60 || m >= 18 * 60)) continue;
      if (opts.periodo === "noite" && m < 18 * 60) continue;
      const ini = localParaUtc(data, m);
      const fim = new Date(ini.getTime() + duracaoMin * 60_000);
      if (ini.getTime() < minimo) continue;
      if (ocupados.some((o) => ini < o.fim && fim > o.inicio)) continue;
      out.push({ inicio: ini.toISOString(), rotulo: rotuloHorario(ini) });
    }
  }
  return out;
}

/** When the team is back: the next opening (skips closed days and holidays), up to two weeks ahead. */
export function proximaAbertura(h: AgentConfig["horarios"], agora: Date): Date | null {
  for (let i = 0; i < 15; i++) {
    const p = partesLocais(new Date(agora.getTime() + i * 86_400_000));
    const d = h.semana[p.diaSemana];
    if (!d.aberto || h.feriados.includes(p.data)) continue;
    const abre = hhmmParaMin(d.inicio);
    if (i === 0 && partesLocais(agora).minutos >= abre) continue;
    return localParaUtc(p.data, abre);
  }
  return null;
}

/** "amanhã às 08:00", "segunda-feira, 23/11 às 08:00" — how the receptionist says when the team is back. */
export function rotuloRetorno(d: Date, agora: Date): string {
  const p = partesLocais(d);
  const hoje = partesLocais(agora);
  const amanha = partesLocais(new Date(agora.getTime() + 86_400_000));
  const hora = `${String(Math.floor(p.minutos / 60)).padStart(2, "0")}:${String(p.minutos % 60).padStart(2, "0")}`;
  if (p.data === hoje.data) return `hoje às ${hora}`;
  if (p.data === amanha.data) return `amanhã às ${hora}`;
  return rotuloHorario(d);
}

export function contextoTemporal(h: AgentConfig["horarios"], agora: Date): string {
  const p = partesLocais(agora);
  const hh = String(Math.floor(p.minutos / 60)).padStart(2, "0");
  const mm = String(p.minutos % 60).padStart(2, "0");
  const dentro = dentroDoHorario(h, agora);
  const volta = dentro ? null : proximaAbertura(h, agora);
  return `Agora é ${DIAS_SEMANA[p.diaSemana]}, ${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}/${p.ano}, ${hh}:${mm} (horário de Brasília). ${
    dentro ? "Estamos dentro do horário de atendimento." : `Estamos FORA do horário de atendimento; a equipe volta ${volta ? rotuloRetorno(volta, agora) : "no próximo dia útil"}.`
  }`;
}
