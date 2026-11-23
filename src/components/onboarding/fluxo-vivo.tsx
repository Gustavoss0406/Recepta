"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, CircleDot, Flag, GitBranch, Maximize2, MessageSquare, Minus, Play, Plus, Sparkles, Variable, Zap } from "lucide-react";
import type { No, TipoNo } from "@/lib/agent/workflow";
import type { FluxoGerado } from "@/lib/onboarding/gerador";
import { cn } from "@/lib/utils";

const W = 200;
const H = 56;

const ESTILO: Record<TipoNo, { cor: string; fundo: string; icone: typeof Play; rotulo: string }> = {
  inicio: { cor: "#0a0a0a", fundo: "#0a0a0a", icone: Play, rotulo: "Início" },
  subagente: { cor: "#2563eb", fundo: "#ffffff", icone: Sparkles, rotulo: "Etapa" },
  falar: { cor: "#7c3aed", fundo: "#ffffff", icone: MessageSquare, rotulo: "Falar" },
  acao: { cor: "#0891b2", fundo: "#ffffff", icone: Zap, rotulo: "Ação" },
  atualizar_estado: { cor: "#64748b", fundo: "#ffffff", icone: Variable, rotulo: "Estado" },
  condicao: { cor: "#d97706", fundo: "#ffffff", icone: GitBranch, rotulo: "Condição" },
  transferir: { cor: "#16a34a", fundo: "#ffffff", icone: ArrowRightLeft, rotulo: "Transferir" },
  fim: { cor: "#0a0a0a", fundo: "#0a0a0a", icone: Flag, rotulo: "Fim" },
};

const CURSORES = [
  { nome: "Recepta", cor: "#2563eb" },
  { nome: "Triagem", cor: "#16a34a" },
  { nome: "Regras", cor: "#e11d48" },
];

type Camera = { x: number; y: number; k: number };

/**
 * The service flow being built live during onboarding: new steps pop in, edges draw themselves,
 * named builder cursors fly to whatever just changed and the camera follows the newest lane.
 * Pan by dragging, zoom with the wheel or the buttons; auto-follow resumes after a few seconds.
 */
export function FluxoVivo({ fluxo, className, compacto }: { fluxo: FluxoGerado; className?: string; compacto?: boolean }) {
  const { workflow, secoes } = fluxo;
  const caixa = useRef<HTMLDivElement>(null);
  const vistos = useRef<Set<string> | null>(null);
  const [novos, setNovos] = useState<string[]>([]);
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, k: 0.5 });
  const [suave, setSuave] = useState(true);
  const manual = useRef(0);
  const arraste = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [tam, setTam] = useState({ w: 800, h: 600 });

  const porId = useMemo(() => new Map(workflow.nos.map((n) => [n.id, n])), [workflow.nos]);

  // which steps are new since the last render (first render: everything animates in)
  useEffect(() => {
    const antes = vistos.current;
    const ids = workflow.nos.map((n) => n.id);
    const n = antes ? ids.filter((id) => !antes.has(id)) : ids;
    vistos.current = new Set(ids);
    setNovos(n);
    const t = setTimeout(() => setNovos([]), 2600 + Math.min(n.length, 40) * 45);
    return () => clearTimeout(t);
  }, [workflow.nos]);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setTam({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const enquadrar = (nos: No[], margem = 60) => {
    if (!nos.length) return;
    const xs = nos.map((n) => n.x);
    const ys = nos.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs) + W, Math.min(...ys), Math.max(...ys) + H];
    const k = Math.min(1.05, Math.max(0.18, Math.min((tam.w - margem * 2) / (x1 - x0 || 1), (tam.h - margem * 2) / (y1 - y0 || 1))));
    setSuave(true);
    setCam({ k, x: tam.w / 2 - ((x0 + x1) / 2) * k, y: tam.h / 2 - ((y0 + y1) / 2) * k });
  };

  // follow what just changed: zoom on the new lane, then pull back to show the whole flow
  useEffect(() => {
    if (Date.now() - manual.current < 6000) return;
    const alvo = novos.length && novos.length < workflow.nos.length ? novos.map((id) => porId.get(id)!).filter(Boolean) : workflow.nos;
    enquadrar(alvo, novos.length < 6 ? 140 : 60);
    if (alvo !== workflow.nos) {
      const t = setTimeout(() => Date.now() - manual.current > 6000 && enquadrar(workflow.nos, 40), 3200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novos, tam.w, tam.h]);

  // builder cursors: each one flies to a different fresh step, then wanders around the flow
  const [alvos, setAlvos] = useState<string[]>([]);
  useEffect(() => {
    let i = 0;
    const mover = () => {
      const fila = novos.length ? novos : workflow.nos.map((n) => n.id);
      setAlvos(CURSORES.map((_, c) => fila[(i * 3 + c * Math.max(1, Math.floor(fila.length / 3))) % Math.max(1, fila.length)]));
      i++;
    };
    mover();
    const t = setInterval(mover, novos.length ? 900 : 2200);
    return () => clearInterval(t);
  }, [novos, workflow.nos]);

  const novosSet = useMemo(() => new Set(novos), [novos]);
  const ordemNovo = useMemo(() => new Map(novos.map((id, i) => [id, i])), [novos]);

  const caminho = (a: No, b: No) => {
    const [x1, y1] = [a.x + W / 2, a.y + H];
    const [x2, y2] = [b.x + W / 2, b.y];
    if (y2 > y1 + 10) {
      const dy = Math.max(30, (y2 - y1) / 2);
      return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
    }
    // edges going back up (loops to the reception / closing) bend to the side
    const lado = x2 >= x1 ? 1 : -1;
    const sx = a.x + (lado > 0 ? W : 0);
    const ex = b.x + (lado > 0 ? W : 0);
    const off = 60 + Math.min(200, Math.abs(y1 - y2) / 6);
    return `M${sx},${a.y + H / 2} C${sx + lado * off},${a.y + H / 2} ${ex + lado * off},${b.y + H / 2} ${ex},${b.y + H / 2}`;
  };

  const zoom = (f: number, cx = tam.w / 2, cy = tam.h / 2) => {
    manual.current = Date.now();
    setSuave(false);
    setCam((c) => {
      const k = Math.min(2, Math.max(0.12, c.k * f));
      return { k, x: cx - ((cx - c.x) * k) / c.k, y: cy - ((cy - c.y) * k) / c.k };
    });
  };

  return (
    <div
      ref={caixa}
      className={cn("relative touch-none overflow-hidden bg-[#f7f7f8] select-none", className)}
      style={{ backgroundImage: "radial-gradient(#d4d4d8 1px, transparent 1px)", backgroundSize: `${22 * cam.k}px ${22 * cam.k}px`, backgroundPosition: `${cam.x}px ${cam.y}px` }}
      onWheel={(e) => {
        const r = caixa.current!.getBoundingClientRect();
        zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
      }}
      onPointerDown={(e) => {
        manual.current = Date.now();
        arraste.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const a = arraste.current;
        if (!a) return;
        manual.current = Date.now();
        setSuave(false);
        setCam((c) => ({ ...c, x: a.cx + e.clientX - a.x, y: a.cy + e.clientY - a.y }));
      }}
      onPointerUp={() => (arraste.current = null)}
      data-testid="fluxo-vivo"
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`, transition: suave ? "transform 1.1s cubic-bezier(.22,1,.36,1)" : "none" }}
      >
        {/* lane titles */}
        {secoes.map((s) => (
          <div key={s.id} className="absolute font-medium tracking-[-0.01em] whitespace-nowrap text-[#71717a]" style={{ left: s.x, top: s.y - 6, width: W, fontSize: 15 }}>
            {s.titulo}
          </div>
        ))}

        <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1}>
          {workflow.arestas.map((a) => {
            const de = porId.get(a.de);
            const para = porId.get(a.para);
            if (!de || !para) return null;
            const nova = novosSet.has(a.de) || novosSet.has(a.para);
            const atraso = Math.max(ordemNovo.get(a.de) ?? 0, ordemNovo.get(a.para) ?? 0) * 45 + 250;
            return (
              <path
                key={a.id}
                d={caminho(de, para)}
                fill="none"
                stroke={nova ? "#2563eb" : "#a1a1aa"}
                strokeOpacity={nova ? 0.9 : 0.45}
                strokeWidth={nova ? 2.2 : 1.3}
                pathLength={1}
                className={nova ? "fluxo-aresta-nova" : undefined}
                style={nova ? { animationDelay: `${atraso}ms` } : undefined}
              />
            );
          })}
        </svg>

        {workflow.nos.map((n) => {
          const e = ESTILO[n.tipo];
          const Icone = e.icone;
          const escuro = n.tipo === "inicio" || n.tipo === "fim";
          const novo = novosSet.has(n.id);
          return (
            <div
              key={n.id}
              data-no={n.id}
              className={cn("absolute flex items-center gap-2.5 rounded-[14px] border px-3 shadow-[0_1px_2px_rgba(0,0,0,.06),0_4px_12px_rgba(0,0,0,.04)]", novo && "fluxo-no-novo")}
              style={{
                left: n.x,
                top: n.y,
                width: W,
                height: H,
                background: e.fundo,
                borderColor: novo ? e.cor : escuro ? e.cor : "#e4e4e7",
                animationDelay: novo ? `${(ordemNovo.get(n.id) ?? 0) * 45}ms` : undefined,
              }}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-[9px]" style={{ background: escuro ? "#27272a" : `${e.cor}14`, color: escuro ? "#fff" : e.cor }}>
                <Icone size={14} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] tracking-wide uppercase" style={{ color: escuro ? "#a1a1aa" : e.cor }}>
                  {e.rotulo}
                </span>
                <span className={cn("block truncate text-[13px] leading-tight font-medium", escuro ? "text-white" : "text-[#18181b]")}>{n.titulo || e.rotulo}</span>
              </span>
            </div>
          );
        })}

        {/* builder cursors */}
        {CURSORES.map((c, i) => {
          const alvo = porId.get(alvos[i] ?? "") ?? workflow.nos[0];
          if (!alvo) return null;
          return (
            <div
              key={c.nome}
              className="pointer-events-none absolute top-0 left-0 z-10"
              style={{ transform: `translate(${alvo.x + W * (0.55 + i * 0.12)}px, ${alvo.y + H * 0.6 + i * 6}px) scale(${1 / Math.max(cam.k, 0.35)})`, transformOrigin: "0 0", transition: "transform .85s cubic-bezier(.22,1,.36,1)" }}
            >
              <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow-[0_1px_2px_rgba(0,0,0,.25)]">
                <path d="M1 1l15 7.2-6.4 1.6L6.4 17z" fill={c.cor} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span className="ml-3 -mt-1 block w-max rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: c.cor }}>
                {c.nome}
              </span>
            </div>
          );
        })}
      </div>

      {/* counters + zoom */}
      <div className={cn("absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-xs text-[#3f3f46] shadow-[0_1px_3px_rgba(0,0,0,.08)] backdrop-blur", compacto && "top-2 left-2 px-2.5 py-1")}>
        <CircleDot size={12} className="text-[#2563eb]" />
        <span data-testid="contador-etapas" className="font-medium tabular-nums">
          {workflow.nos.length}
        </span>
        etapas ·<span className="font-medium tabular-nums">{workflow.arestas.length}</span> conexões
      </div>
      <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-[12px] bg-white/90 shadow-[0_1px_3px_rgba(0,0,0,.1)] backdrop-blur">
        <button type="button" aria-label="Aproximar" onClick={() => zoom(1.25)} className="grid size-8 place-items-center hover:bg-black/5">
          <Plus size={14} />
        </button>
        <button type="button" aria-label="Afastar" onClick={() => zoom(0.8)} className="grid size-8 place-items-center hover:bg-black/5">
          <Minus size={14} />
        </button>
        <button
          type="button"
          aria-label="Ver tudo"
          onClick={() => {
            manual.current = 0;
            enquadrar(workflow.nos, 40);
          }}
          className="grid size-8 place-items-center hover:bg-black/5"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  );
}
