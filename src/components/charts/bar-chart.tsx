"use client";

import { useState } from "react";

/** Single-series bar chart (magnitude): thin bars, 4px rounded tops, hover tooltip, table fallback. */
export function BarChart({ titulo, rotulos, valores, sufixo = "", altura = 160 }: { titulo: string; rotulos: string[]; valores: number[]; sufixo?: string; altura?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...valores);
  const W = 600;
  const pad = { l: 28, r: 8, t: 12, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = altura - pad.t - pad.b;
  const bw = iw / valores.length;
  const passoRotulo = Math.ceil(valores.length / 12);
  return (
    <figure className="rounded-[16px] border border-border bg-background p-4">
      <figcaption className="text-sm font-medium text-foreground">{titulo}</figcaption>
      <svg viewBox={`0 0 ${W} ${altura}`} className="mt-2 w-full" role="img" aria-label={titulo} onPointerLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih * (1 - f)} y2={pad.t + ih * (1 - f)} stroke="#ebebeb" />
            <text x={pad.l - 6} y={pad.t + ih * (1 - f) + 3} fontSize="10" textAnchor="end" fill="var(--color-muted-foreground)">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {valores.map((v, i) => {
          const h = (v / max) * ih;
          const x = pad.l + i * bw + bw * 0.18;
          const w = Math.max(2, bw * 0.64);
          return (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" />
              {h > 0 && <path d={`M${x},${pad.t + ih} v${-(h - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${h - 4} z`} fill="#2563eb" opacity={hover == null || hover === i ? 1 : 0.45} />}
              {i % passoRotulo === 0 && (
                <text x={pad.l + i * bw + bw / 2} y={altura - 6} fontSize="10" textAnchor="middle" fill="var(--color-muted-foreground)">
                  {rotulos[i]}
                </text>
              )}
            </g>
          );
        })}
        {hover != null && (
          <g transform={`translate(${Math.min(pad.l + hover * bw + bw / 2 + 6, W - 110)},${pad.t})`} pointerEvents="none">
            <rect width="100" height="34" rx="6" fill="#fff" stroke="var(--color-hairline)" />
            <text x="8" y="14" fontSize="10" fill="var(--color-muted-foreground)">
              {rotulos[hover]}
            </text>
            <text x="8" y="27" fontSize="11" fill="var(--color-ink)">
              {valores[hover]}
              {sufixo}
            </text>
          </g>
        )}
      </svg>
      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Ver tabela</summary>
        <table className="mt-2 w-full">
          <tbody>
            {rotulos.map((r, i) => (
              <tr key={r}>
                <td>{r}</td>
                <td className="text-right">
                  {valores[i]}
                  {sufixo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
