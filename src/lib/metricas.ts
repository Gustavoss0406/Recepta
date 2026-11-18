export type Formato = "int" | "duracao" | "pct";
const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Shared by the server (metric strip) and the client chart (axis and tooltip). */
export function formatarMetrica(v: number, f: Formato): string {
  if (f === "pct") return `${nf.format(v)}%`;
  if (f === "duracao") return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`;
  return nf.format(v);
}
