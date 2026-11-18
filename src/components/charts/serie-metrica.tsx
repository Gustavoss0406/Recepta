"use client";

import { useMemo, useRef, useState } from "react";
import { formatarMetrica, type Formato } from "@/lib/metricas";

export interface Ponto {
  data: string; // AAAA-MM-DD (local)
  valor: number;
}

const COR = "#2563eb"; // validated single-series blue (light surface)
const dataFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const rotuloData = (d: string) => dataFmt.format(new Date(`${d}T12:00:00Z`)).replace(".", "");


function escala(max: number, f: Formato): { passo: number; topo: number } {
  if (f === "pct") return { passo: 25, topo: 100 };
  if (max <= 0) return { passo: 1, topo: 3 };
  const bruto = max / 3;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / pot;
  const passo = Math.max(f === "int" ? 1 : 0, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pot);
  return { passo, topo: Math.max(passo * 3, Math.ceil(max / passo) * passo) };
}

const W = 720;
const H = 240;
const M = { t: 12, r: 8, b: 8, l: 40 };

/** Single-series line + area (ElevenAgents analytics style) with crosshair tooltip and a table fallback. */
export function SerieMetrica({ pontos, formato, nome }: { pontos: Ponto[]; formato: Formato; nome: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const formatar = (v: number) => formatarMetrica(v, formato);

  const { ticks, x, y, linha, area } = useMemo(() => {
    const { passo, topo } = escala(Math.max(0, ...pontos.map((p) => p.valor)), formato);
    const iw = W - M.l - M.r;
    const ih = H - M.t - M.b;
    const x = (i: number) => M.l + (pontos.length <= 1 ? iw / 2 : (i / (pontos.length - 1)) * iw);
    const y = (v: number) => M.t + ih - (v / topo) * ih;
    const linha = pontos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join("");
    const area = pontos.length ? `${linha}L${x(pontos.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : "";
    const ticks = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
    return { ticks, x, y, linha, area };
  }, [pontos, formato]);

  const mover = (e: React.PointerEvent) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !pontos.length) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - M.l) / (W - M.l - M.r)) * (pontos.length - 1));
    setHover(Math.max(0, Math.min(pontos.length - 1, i)));
  };
  const h = hover != null ? pontos[hover] : null;

  return (
    <figure className="relative">
      <div className="relative">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="h-[240px] w-full touch-none overflow-visible"
          preserveAspectRatio="none"
          onPointerMove={mover}
          onPointerDown={mover}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`${nome} por dia`}
        >
          <defs>
            <linearGradient id="area-metrica" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={COR} stopOpacity="0.12" />
              <stop offset="1" stopColor={COR} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <line key={t} x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#ebebeb" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill="url(#area-metrica)" />
          <path d={linha} fill="none" stroke={COR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {h && hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} stroke="#a3a3a3" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {ticks.map((t) => (
          <span key={t} className="pointer-events-none absolute left-0 w-8 -translate-y-1/2 text-right text-[0.6875rem] text-muted-foreground tabular-nums" style={{ top: `${(y(t) / H) * 100}%` }}>
            {formatar(t)}
          </span>
        ))}
        {h && hover != null && (
          <>
            <span
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.valor) / H) * 100}%`, background: COR, boxShadow: "0 0 0 1px rgba(0,0,0,0.06)" }}
            />
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-[10px] bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-[var(--shadow-float)]"
              style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${x(hover) > W * 0.7 ? "calc(-100% - 10px)" : "10px"})` }}
            >
              <p className="text-muted-foreground">{rotuloData(h.data)}</p>
              <p className="font-medium text-foreground tabular-nums">
                {formatar(h.valor)} <span className="font-normal text-muted-foreground">· {nome}</span>
              </p>
            </div>
          </>
        )}
      </div>
      {pontos.length > 0 && (
        <figcaption className="mt-2 flex justify-between pl-10 text-xs text-muted-foreground">
          <span>{rotuloData(pontos[0].data)}</span>
          <span>{rotuloData(pontos[pontos.length - 1].data)}</span>
        </figcaption>
      )}
      <table className="sr-only">
        <caption>{nome} por dia</caption>
        <tbody>
          {pontos.map((p) => (
            <tr key={p.data}>
              <th scope="row">{p.data}</th>
              <td>{formatar(p.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
