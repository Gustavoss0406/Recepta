"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type CSSProperties } from "react";
import type { AgentState } from "@/components/elevenlabs-ui/orb";
import { cn } from "@/lib/utils";

export type OrbTom = "padrao" | "sky" | "mint" | "peach" | "lavender" | "rose" | "ink" | "neutro";

/**
 * Two-color pairs for the ElevenLabs UI Orb shader (MIT). "padrao", "peach", "ink" and "neutro"
 * are the pairs shipped in the ElevenLabs UI examples; the others are our tints of the same recipe.
 */
export const ORB_CORES: Record<OrbTom, [string, string]> = {
  padrao: ["#CADCFC", "#A0B9D1"],
  sky: ["#CADCFC", "#A0B9D1"],
  mint: ["#D2F2E6", "#8FC9B4"],
  peach: ["#F6E7D8", "#E0CFC2"],
  lavender: ["#E4DCFA", "#B3A5DA"],
  rose: ["#F8DEE6", "#D7A9B8"],
  ink: ["#A0A0A0", "#232323"],
  neutro: ["#F4F4F4", "#E0E0E0"],
};

const OrbWebGL = dynamic(() => import("@/components/elevenlabs-ui/orb").then((m) => m.Orb), { ssr: false });

/** sRGB hex → the colour the shader actually shows (it writes linear values without output conversion). */
function comoNoShader(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(lin(c) * 255));
  return `rgb(${r} ${g} ${b})`;
}

/** Static stand-in drawn like the shader (three soft lobes of both colours over white): avatars, loading, reduced motion. */
function OrbEstatico({ cores, tamanho, className }: { cores: [string, string]; tamanho: number | string; className?: string }) {
  const a = comoNoShader(cores[0]);
  const b = comoNoShader(cores[1]);
  const px = typeof tamanho === "number" ? tamanho : 160;
  const lobo = (ini: number) => `${b} ${ini}deg, ${a} ${ini + 55}deg, ${b} ${ini + 88}deg, #fff ${ini + 104}deg, #fff ${ini + 112}deg`;
  return (
    <span
      aria-hidden
      className={cn("relative inline-block shrink-0 overflow-hidden rounded-full", className)}
      style={{ width: tamanho, height: tamanho, boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.08)", isolation: "isolate" }}
    >
      <span
        className="absolute -inset-[12%]"
        style={{
          background: `conic-gradient(from 25deg, ${lobo(0)}, ${lobo(120)}, ${lobo(240)}, ${b} 360deg)`,
          filter: `blur(${Math.max(1, px * 0.045)}px)`,
        }}
      />
      <span className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.5), rgba(255,255,255,0) 30%)" }} />
    </span>
  );
}

/**
 * Voice orb. Large orbs render the ElevenLabs UI WebGL shader (one canvas each); small ones
 * (avatars, list rows) stay static so a page never spins up dozens of WebGL contexts.
 */
export function Orb({
  tom = "padrao",
  cores,
  tamanho = 160,
  estado = null,
  estatico,
  className,
  children,
}: {
  tom?: OrbTom;
  cores?: [string, string];
  tamanho?: number | string;
  estado?: AgentState;
  estatico?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const par = cores ?? ORB_CORES[tom];
  const pequeno = typeof tamanho === "number" && tamanho < 64;
  const [animar, setAnimar] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ok = () => {
      try {
        return !!document.createElement("canvas").getContext("webgl2");
      } catch {
        return false;
      }
    };
    setAnimar(!mq.matches && ok());
  }, []);

  if (pequeno || estatico) return <OrbEstatico cores={par} tamanho={tamanho} className={className} />;
  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: tamanho, height: tamanho }}>
      <OrbEstatico cores={par} tamanho="100%" className={cn("absolute inset-0 transition-opacity duration-700", animar && "opacity-0")} />
      {animar && <OrbWebGL colors={par} agentState={estado} className="absolute inset-0" />}
      {children && <div className="relative z-10">{children}</div>}
    </div>
  );
}
