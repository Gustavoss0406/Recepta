"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ChartLine,
  ChevronsUpDown,
  CreditCard,
  FlaskConical,
  House,
  Inbox,
  LogOut,
  Menu,
  PanelLeft,
  Phone,
  PhoneCall,
  Plug,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  exato?: boolean;
  contador?: "pendencias";
}

/** Same grouping as the ElevenAgents sidebar: Configure / Monitor / Deploy. */
const GRUPOS: { titulo?: string; itens: Item[] }[] = [
  { itens: [{ href: "/painel", label: "Início", icon: House, exato: true }] },
  {
    titulo: "Configurar",
    itens: [
      { href: "/painel/agentes", label: "Agentes", icon: Bot },
      { href: "/painel/integracoes", label: "Integrações", icon: Plug },
    ],
  },
  {
    titulo: "Monitorar",
    itens: [
      { href: "/painel/ligacoes", label: "Ligações", icon: PhoneCall },
      { href: "/painel/pendencias", label: "Pendências", icon: Inbox, contador: "pendencias" },
      { href: "/painel/testes", label: "Testes", icon: FlaskConical },
      { href: "/painel/analises", label: "Análises", icon: ChartLine },
    ],
  },
  { titulo: "Publicar", itens: [{ href: "/painel/numeros", label: "Números e canais", icon: Phone }] },
];
const RODAPE: Item[] = [
  { href: "/painel/cobranca", label: "Uso e cobrança", icon: CreditCard },
  { href: "/painel/configuracoes", label: "Configurações", icon: Settings },
];
const MOBILE: Item[] = [GRUPOS[0].itens[0], GRUPOS[2].itens[0], GRUPOS[2].itens[1], GRUPOS[1].itens[0]];

export interface SidebarProps {
  orgNome: string;
  usuarioNome: string;
  usuarioEmail: string;
  papel: string;
  pendencias: number;
  uso: { usados: number; incluidos: number; plano: string; trial: boolean };
  sair: () => Promise<void>;
}

const CHAVE = "recepta:sidebar-recolhida";

function Iniciais({ nome, className }: { nome: string; className?: string }) {
  const i = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return <span className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-[#e8e8e8] text-[0.6875rem] font-medium text-[#3f3f3f]", className)}>{i}</span>;
}

export function Sidebar({ orgNome, usuarioNome, usuarioEmail, papel, pendencias, uso, sair }: SidebarProps) {
  const path = usePathname();
  const [aberto, setAberto] = useState(false);
  const [recolhida, setRecolhida] = useState(false);
  const [menuConta, setMenuConta] = useState(false);
  const contaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE);
      // No saved choice: start collapsed on notebook-size screens so content keeps its width.
      setRecolhida(salvo === null ? window.innerWidth < 1440 : salvo === "1");
    } catch {}
  }, []);
  useEffect(() => {
    if (!menuConta) return;
    const fora = (e: MouseEvent) => !contaRef.current?.contains(e.target as Node) && setMenuConta(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuConta(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menuConta]);
  useEffect(() => setAberto(false), [path]);

  const alternar = () =>
    setRecolhida((r) => {
      try {
        localStorage.setItem(CHAVE, r ? "0" : "1");
      } catch {}
      return !r;
    });

  const ativo = (i: Item) => (i.exato ? path === i.href : path === i.href || path.startsWith(i.href + "/"));
  const pct = Math.min(100, Math.round((uso.usados / Math.max(1, uso.incluidos)) * 100));

  const link = (i: Item, compacto: boolean) => {
    const Icon = i.icon;
    const n = i.contador === "pendencias" ? pendencias : 0;
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={ativo(i) ? "page" : undefined}
        title={compacto ? i.label : undefined}
        className={cn(
          "group relative flex h-8 items-center gap-2.5 rounded-[8px] text-[0.875rem] transition-colors duration-150",
          compacto ? "w-8 justify-center" : "px-2",
          ativo(i) ? "bg-[#ebebeb]/80 font-medium text-foreground" : "text-[#525252] hover:bg-black/[0.04] hover:text-foreground",
        )}
      >
        <Icon size={16} strokeWidth={ativo(i) ? 2 : 1.6} className="shrink-0" aria-hidden />
        {!compacto && <span className="truncate">{i.label}</span>}
        {n > 0 &&
          (compacto ? (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-[#e5484d]" aria-label={`${n} pendentes`} />
          ) : (
            <span className="ml-auto rounded-full bg-[#e5484d] px-1.5 text-[0.6875rem] leading-[18px] font-medium text-white tabular-nums">{n}</span>
          ))}
      </Link>
    );
  };

  const navegacao = (compacto: boolean) => (
    <nav aria-label="Painel" className="flex flex-col gap-4">
      {GRUPOS.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-px">
          {g.titulo && !compacto && <p className="px-2 pb-1 text-[0.75rem] font-medium text-[#8f8f8f]">{g.titulo}</p>}
          {g.titulo && compacto && <span className="mx-auto mb-1 h-px w-4 bg-black/10" aria-hidden />}
          {g.itens.map((i) => link(i, compacto))}
        </div>
      ))}
    </nav>
  );

  const conta = (compacto: boolean) => (
    <div ref={contaRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuConta((m) => !m)}
        aria-expanded={menuConta}
        aria-haspopup="menu"
        className={cn("flex w-full items-center gap-2.5 rounded-[10px] text-left transition-colors hover:bg-black/[0.04]", compacto ? "justify-center p-1" : "p-1.5")}
      >
        <Iniciais nome={usuarioNome} />
        {!compacto && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8125rem] font-medium text-foreground">{usuarioNome}</span>
              <span className="block truncate text-xs text-muted-foreground">{orgNome}</span>
            </span>
            <ChevronsUpDown size={14} className="shrink-0 text-muted-foreground" aria-hidden />
          </>
        )}
      </button>
      {menuConta && (
        <div role="menu" className={cn("absolute bottom-full z-50 mb-1.5 w-60 rounded-[14px] bg-popover/95 p-1 shadow-[var(--shadow-float)] backdrop-blur-xl", compacto ? "left-0" : "inset-x-0 w-auto")}>
          <div className="px-2.5 pt-2 pb-2.5">
            <p className="truncate text-sm font-medium text-foreground">{usuarioNome}</p>
            <p className="truncate text-xs text-muted-foreground">{usuarioEmail}</p>
            <p className="mt-1 text-xs text-muted-foreground capitalize">
              {papel} · {orgNome}
            </p>
          </div>
          <div className="h-px bg-border" />
          {RODAPE.map((i) => (
            <Link key={i.href} role="menuitem" href={i.href} onClick={() => setMenuConta(false)} className="flex h-8 items-center gap-2.5 rounded-[8px] px-2.5 text-sm text-foreground hover:bg-accent">
              <i.icon size={15} strokeWidth={1.6} aria-hidden /> {i.label}
            </Link>
          ))}
          <div className="h-px bg-border" />
          <form action={sair}>
            <button type="submit" role="menuitem" className="flex h-8 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-sm text-foreground hover:bg-accent">
              <LogOut size={15} strokeWidth={1.6} aria-hidden /> Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );

  const usoCartao = (
    <Link href="/painel/cobranca" className="block rounded-[12px] px-2.5 py-2 transition-colors hover:bg-black/[0.04]">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-foreground">{uso.trial ? "Teste grátis" : `Plano ${uso.plano}`}</span>
        <span className="text-muted-foreground tabular-nums">
          {uso.usados} de {uso.incluidos} min
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/[0.07]" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Uso da franquia">
        <div className={cn("h-full rounded-full transition-[width] duration-500", pct >= 100 ? "bg-[#e5484d]" : pct >= 80 ? "bg-[#f5a524]" : "bg-foreground")} style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-black/[0.06] bg-[#fbfbfb]/80 backdrop-blur-xl transition-[width] duration-300 ease-[var(--ease-apple)] lg:flex",
          recolhida ? "w-[56px] items-center px-2 py-3" : "w-[232px] px-3 py-3",
        )}
      >
        <div className={cn("flex h-9 items-center", recolhida ? "justify-center" : "justify-between pl-1.5")}>
          {!recolhida && (
            <Link href="/painel" className="text-foreground" aria-label="Início">
              <Logo className="[&_span]:!text-[1.2rem]" />
            </Link>
          )}
          <button
            type="button"
            onClick={alternar}
            className="grid size-8 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground"
            aria-label={recolhida ? "Expandir barra lateral" : "Recolher barra lateral"}
          >
            <PanelLeft size={16} strokeWidth={1.6} />
          </button>
        </div>

        <div className={cn("mt-5 min-h-0 flex-1 overflow-y-auto", recolhida && "flex flex-col items-center")}>{navegacao(recolhida)}</div>

        <div className={cn("mt-3 flex flex-col gap-1.5 border-t border-black/[0.06] pt-3", recolhida ? "items-center" : "")}>
          {!recolhida && usoCartao}
          {conta(recolhida)}
        </div>
      </aside>

      {/* Mobile: translucent top bar, tab bar and a sheet with the full navigation */}
      <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-black/[0.06] bg-white/80 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/painel" className="text-foreground" aria-label="Início">
          <Logo className="[&_span]:!text-[1.15rem]" />
        </Link>
        <button type="button" onClick={() => setAberto(true)} className="grid size-9 place-items-center rounded-full hover:bg-black/[0.04]" aria-label="Abrir menu">
          <Menu size={18} />
        </button>
      </header>
      <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-black/[0.06] bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {MOBILE.map((i) => {
          const Icon = i.icon;
          const n = i.contador === "pendencias" ? pendencias : 0;
          return (
            <Link key={i.href} href={i.href} className={cn("relative flex h-[52px] flex-col items-center justify-center gap-0.5 text-[0.6875rem]", ativo(i) ? "text-foreground" : "text-[#8f8f8f]")}>
              <Icon size={19} strokeWidth={ativo(i) ? 2 : 1.6} />
              {i.label}
              {n > 0 && <span className="absolute top-1.5 left-[calc(50%+6px)] rounded-full bg-[#e5484d] px-1 text-[0.625rem] leading-[14px] text-white">{n}</span>}
            </Link>
          );
        })}
        <button type="button" onClick={() => setAberto(true)} className="flex h-[52px] flex-col items-center justify-center gap-0.5 text-[0.6875rem] text-[#8f8f8f]">
          <Menu size={19} strokeWidth={1.6} />
          Mais
        </button>
      </nav>
      {aberto && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={() => setAberto(false)} aria-label="Fechar menu" />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[22px] bg-white px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)]">
            <span className="mx-auto mb-2 h-1 w-9 rounded-full bg-black/15" aria-hidden />
            <div className="flex items-center justify-between px-2 pb-3">
              <p className="truncate text-sm font-medium text-foreground">{orgNome}</p>
              <button type="button" onClick={() => setAberto(false)} className="grid size-8 place-items-center rounded-full bg-black/[0.05]" aria-label="Fechar">
                <X size={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {navegacao(false)}
              <div className="mt-4 flex flex-col gap-px border-t border-border pt-3">{RODAPE.map((i) => link(i, false))}</div>
            </div>
            <div className="mt-3 border-t border-border pt-3">
              {usoCartao}
              <form action={sair} className="mt-1">
                <button type="submit" className="flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-sm text-[#525252] hover:bg-black/[0.04]">
                  <LogOut size={15} strokeWidth={1.6} /> Sair
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
