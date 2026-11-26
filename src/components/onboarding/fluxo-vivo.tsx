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
type Ponto = { x: number; y: number };
type Cursor = Ponto & { segurando: string | null; ms: number };

/**
 * The service flow being built live during onboarding. Every new step is really *built*: a named
 * cursor goes to the step it comes from (or the lane title), picks the new card up there, drags it
 * to its place and drops it — and only then its connections draw. Three cursors work the queue in
 * parallel, in the flow's order, so the motion always means something. Existing cards glide to
 * their new place when the layout grows. Pan by dragging, zoom with the wheel or the buttons.
 */
export function FluxoVivo({ fluxo, className, compacto }: { fluxo: FluxoGerado; className?: string; compacto?: boolean }) {
  const { workflow, secoes } = fluxo;
  const caixa = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 800, h: 600 });
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, k: 0.5 });
  const [suave, setSuave] = useState(true);
  const manual = useRef(0);
  const arraste = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  const porId = useMemo(() => new Map(workflow.nos.map((n) => [n.id, n])), [workflow.nos]);
  const porIdRef = useRef(porId);
  porIdRef.current = porId;

  // build state: which cards are placed, which are being carried (and where), which edges are drawn
  const [colocados, setColocados] = useState<Set<string>>(() => new Set(workflow.nos.map((n) => n.id)));
  const [carregando, setCarregando] = useState<Map<string, Ponto>>(new Map());
  const [recemLigados, setRecemLigados] = useState<Set<string>>(new Set());
  const [cursores, setCursores] = useState<Cursor[]>(() => CURSORES.map((_, i) => ({ x: (workflow.nos[0]?.x ?? 0) + 60 + i * 40, y: (workflow.nos[0]?.y ?? 0) - 40, segurando: null, ms: 0 })));
  const fila = useRef<string[]>([]);
  const ativos = useRef(0);
  const vivo = useRef(true);
  const [construindo, setConstruindo] = useState(false);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setTam({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const enquadrar = (nos: Ponto[], margem = 60) => {
    if (!nos.length) return;
    const xs = nos.map((n) => n.x);
    const ys = nos.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs) + W, Math.min(...ys), Math.max(...ys) + H];
    const k = Math.min(1, Math.max(0.16, Math.min((tam.w - margem * 2) / (x1 - x0 || 1), (tam.h - margem * 2) / (y1 - y0 || 1))));
    setSuave(true);
    setCam({ k, x: tam.w / 2 - ((x0 + x1) / 2) * k, y: tam.h / 2 - ((y0 + y1) / 2) * k });
  };
  const enquadrarRef = useRef(enquadrar);
  enquadrarRef.current = enquadrar;
  const seguir = () => Date.now() - manual.current > 6000;

  // where a new card is picked up: the step it comes from (already placed), else its lane title
  const origem = (id: string, feitos: Set<string>): Ponto => {
    const pai = workflow.arestas.find((a) => a.para === id && feitos.has(a.de));
    const p = pai && porIdRef.current.get(pai.de);
    if (p) return { x: p.x, y: p.y };
    const s = secoes.find((x) => x.nos.includes(id));
    return s ? { x: s.x, y: s.y } : { x: 0, y: 0 };
  };

  // new steps go into the queue in flow order; removed ones disappear
  useEffect(() => {
    const ids = workflow.nos.map((n) => n.id);
    const atuais = new Set(ids);
    setColocados((c) => new Set([...c].filter((x) => atuais.has(x))));
    const novos = ids.filter((id) => !colocados.has(id) && !fila.current.includes(id) && !carregando.has(id));
    if (!novos.length) {
      if (seguir()) enquadrarRef.current(workflow.nos, 40);
      return;
    }
    fila.current.push(...novos);
    if (seguir()) enquadrarRef.current(novos.map((id) => porIdRef.current.get(id)!).filter(Boolean), novos.length < 6 ? 140 : 70);
    const ritmo = Math.min(1300, Math.max(380, (8000 * CURSORES.length) / Math.max(1, fila.current.length)));
    CURSORES.forEach((_, i) => trabalhar(i, ritmo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.nos]);

  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function trabalhar(c: number, ritmo: number) {
    if (cursores[c] && (ativosPorCursor.current[c] ?? false)) return;
    ativosPorCursor.current[c] = true;
    ativos.current++;
    setConstruindo(true);
    while (vivo.current && fila.current.length) {
      const id = fila.current.shift()!;
      const alvo = porIdRef.current.get(id);
      if (!alvo) continue;
      const feitos = colocadosRef.current;
      const de = origem(id, feitos);
      const ida = ritmo * 0.4;
      const volta = ritmo * 0.6;
      // 1. go to where the card comes from
      setCursores((cs) => cs.map((x, i) => (i === c ? { x: de.x + W * 0.7, y: de.y + H * 0.7, segurando: null, ms: ida } : x)));
      await espera(ida);
      // 2. pick it up and drag it to its place
      setCarregando((m) => new Map(m).set(id, { x: de.x + 14, y: de.y + 14 }));
      await espera(30);
      setCarregando((m) => new Map(m).set(id, { x: alvo.x, y: alvo.y }));
      setCursores((cs) => cs.map((x, i) => (i === c ? { x: alvo.x + W * 0.7, y: alvo.y + H * 0.7, segurando: id, ms: volta } : x)));
      await espera(volta);
      // 3. drop it: the card is placed and its connections draw
      setCarregando((m) => {
        const n = new Map(m);
        n.delete(id);
        return n;
      });
      setColocados((s) => new Set(s).add(id));
      colocadosRef.current = new Set(colocadosRef.current).add(id);
      const ligadas = workflow.arestas.filter((a) => a.de === id || a.para === id).map((a) => a.id);
      setRecemLigados((s) => new Set([...s, ...ligadas]));
      setCursores((cs) => cs.map((x, i) => (i === c ? { ...x, segurando: null } : x)));
    }
    ativosPorCursor.current[c] = false;
    ativos.current--;
    if (ativos.current === 0) {
      setConstruindo(false);
      setTimeout(() => {
        setRecemLigados(new Set());
        if (vivo.current && seguir()) enquadrarRef.current([...porIdRef.current.values()], 40);
      }, 1400);
    }
  }
  const ativosPorCursor = useRef<boolean[]>([]);
  const colocadosRef = useRef(colocados);
  useEffect(() => {
    colocadosRef.current = colocados;
  }, [colocados]);

  // first frame: show the whole flow
  useEffect(() => {
    enquadrar(workflow.nos, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tam.w, tam.h]);

  const caminho = (a: Ponto, b: Ponto) => {
    const [x1, y1] = [a.x + W / 2, a.y + H];
    const [x2, y2] = [b.x + W / 2, b.y];
    if (y2 > y1 + 10) {
      const dy = Math.max(30, (y2 - y1) / 2);
      return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
    }
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

  const visiveis = workflow.nos.filter((n) => colocados.has(n.id) || carregando.has(n.id));
  const feitos = workflow.nos.filter((n) => colocados.has(n.id)).length;

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
      data-construindo={construindo ? "sim" : "nao"}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`, transition: suave ? "transform 1.1s cubic-bezier(.22,1,.36,1)" : "none" }}
      >
        {secoes
          .filter((s) => s.nos.some((id) => colocados.has(id) || carregando.has(id)))
          .map((s) => (
            <div key={s.id} className="absolute font-medium tracking-[-0.01em] whitespace-nowrap text-[#71717a] transition-transform duration-700" style={{ transform: `translate(${s.x}px, ${s.y - 6}px)`, fontSize: 15 }}>
              {s.titulo}
            </div>
          ))}

        <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1}>
          {workflow.arestas.map((a) => {
            if (!colocados.has(a.de) || !colocados.has(a.para)) return null;
            const de = porId.get(a.de)!;
            const para = porId.get(a.para)!;
            const nova = recemLigados.has(a.id);
            return (
              <path
                key={a.id}
                d={caminho(de, para)}
                fill="none"
                stroke={nova ? "#2563eb" : "#a1a1aa"}
                strokeOpacity={nova ? 0.9 : 0.4}
                strokeWidth={nova ? 2.2 : 1.3}
                pathLength={1}
                className={nova ? "fluxo-aresta-nova" : undefined}
              />
            );
          })}
        </svg>

        {visiveis.map((n) => {
          const e = ESTILO[n.tipo];
          const Icone = e.icone;
          const escuro = n.tipo === "inicio" || n.tipo === "fim";
          const p = carregando.get(n.id) ?? n;
          const noAr = carregando.has(n.id);
          const cursor = cursores.find((c) => c.segurando === n.id);
          return (
            <div
              key={n.id}
              data-no={n.id}
              className={cn(
                "absolute top-0 left-0 flex items-center gap-2.5 rounded-[14px] border px-3",
                noAr ? "z-20 shadow-[0_12px_28px_rgba(0,0,0,.18)]" : "shadow-[0_1px_2px_rgba(0,0,0,.06),0_4px_12px_rgba(0,0,0,.04)]",
              )}
              style={{
                width: W,
                height: H,
                background: e.fundo,
                borderColor: noAr ? e.cor : escuro ? e.cor : "#e4e4e7",
                transform: `translate(${p.x}px, ${p.y}px) ${noAr ? "rotate(-2deg) scale(1.04)" : ""}`,
                transition: `transform ${noAr ? (cursor?.ms ?? 500) : 700}ms cubic-bezier(.45,0,.2,1), box-shadow .3s`,
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

        {CURSORES.map((c, i) => {
          const cur = cursores[i];
          return (
            <div
              key={c.nome}
              className="pointer-events-none absolute top-0 left-0 z-30"
              style={{ transform: `translate(${cur.x}px, ${cur.y}px) scale(${1 / Math.max(cam.k, 0.35)})`, transformOrigin: "0 0", transition: `transform ${cur.ms || 600}ms cubic-bezier(.45,0,.2,1)` }}
            >
              <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow-[0_1px_2px_rgba(0,0,0,.25)]">
                <path d="M1 1l15 7.2-6.4 1.6L6.4 17z" fill={c.cor} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span className="ml-3 -mt-1 block w-max rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: c.cor }}>
                {c.nome}
                {cur.segurando && <span className="opacity-75"> · {porId.get(cur.segurando)?.titulo?.slice(0, 18)}</span>}
              </span>
            </div>
          );
        })}
      </div>

      <div className={cn("absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-xs text-[#3f3f46] shadow-[0_1px_3px_rgba(0,0,0,.08)] backdrop-blur", compacto && "top-2 left-2 px-2.5 py-1")}>
        <CircleDot size={12} className={cn("text-[#2563eb]", construindo && "animate-pulse")} />
        <span data-testid="contador-etapas" data-total={workflow.nos.length} className="font-medium tabular-nums">
          {feitos}
        </span>
        etapas ·<span className="font-medium tabular-nums">{workflow.arestas.filter((a) => colocados.has(a.de) && colocados.has(a.para)).length}</span> conexões
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

export type { No };
