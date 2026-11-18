"use client";

import { useMemo, useState } from "react";

export interface Series {
  key: string;
  label: string;
  color: string; // CSS color (token var)
  values: number[]; // 0..100
}

/**
 * Two-series percentage line chart with crosshair + tooltip.
 * One y-axis (0–100%), 2px lines, legend + direct end labels, table fallback.
 */
export function LineCompare({
  title,
  headline,
  labels,
  series,
  height = 180,
}: {
  title: string;
  headline: string;
  labels: string[];
  series: Series[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = height;
  const pad = { l: 34, r: 56, t: 10, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = labels.length;
  const x = (i: number) => pad.l + (iw * i) / (n - 1);
  const y = (v: number) => pad.t + ih - (ih * v) / 100;

  const paths = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        d: s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" "),
      })),
    [series], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * iw;
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / iw) * (n - 1)))));
  }

  return (
    <figure className="rounded-[12px] bg-white p-4 shadow-[var(--shadow-pill)]">
      <figcaption className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.8125rem] font-medium text-ink">{title}</p>
          <p className="text-sm text-muted-foreground">{headline}</p>
        </div>
        <ul className="flex gap-3 text-xs text-body" aria-label="Legenda">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`${title}: ${headline}`}>
        {[0, 50, 100].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-hairline)" />
            <text x={pad.l - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--color-muted)">
              {t}%
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 4} fontSize="10" fill="var(--color-muted)">
          {labels[0]}
        </text>
        <text x={W - pad.r} y={H - 4} fontSize="10" textAnchor="end" fill="var(--color-muted)">
          {labels[n - 1]}
        </text>
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--color-hairline-strong)" />}
        {paths.map((s) => (
          <g key={s.key}>
            <path d={s.d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <text x={W - pad.r + 6} y={y(s.values[n - 1]) + 3} fontSize="10" fill="var(--color-body)">
              {s.label} {s.values[n - 1].toFixed(0)}%
            </text>
            {hover !== null && (
              <circle cx={x(hover)} cy={y(s.values[hover])} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
            )}
          </g>
        ))}
        <rect
          x={pad.l}
          y={pad.t}
          width={iw}
          height={ih}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
        {hover !== null && (
          <g transform={`translate(${Math.min(x(hover) + 8, W - pad.r - 110)},${pad.t + 4})`} pointerEvents="none">
            <rect width="108" height={18 + series.length * 15} rx="6" fill="#fff" stroke="var(--color-hairline)" />
            <text x="8" y="14" fontSize="10" fill="var(--color-muted)">
              {labels[hover]}
            </text>
            {series.map((s, i) => (
              <text key={s.key} x="8" y={29 + i * 15} fontSize="10.5" fill="var(--color-ink)">
                <tspan fill={s.color}>●</tspan> {s.label}: {s.values[hover].toFixed(1)}%
              </text>
            ))}
          </g>
        )}
      </svg>
      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Ver tabela</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="font-medium">Dia</th>
              {series.map((s) => (
                <th key={s.key} className="font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={l}>
                <td>{l}</td>
                {series.map((s) => (
                  <td key={s.key}>{s.values[i].toFixed(1)}%</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
