import Link from "next/link";
import { ChevronDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SP = Record<string, string | undefined>;

export function hrefCom(base: string, sp: SP, mudar: SP) {
  const qs = new URLSearchParams(Object.entries({ ...sp, ...mudar }).filter(([, v]) => v) as [string, string][]);
  const s = qs.toString();
  return `${base}${s ? `?${s}` : ""}`;
}

/** "+ Filter ⌄" pill with a popover of options (ElevenAgents list filters). No JS: <details> + links. */
export function FiltroPilula({ base, rotulo, valor, opcoes, sp, chave }: { base: string; rotulo: string; valor?: string; opcoes: { v: string; t: string }[]; sp: SP; chave: string }) {
  const atual = opcoes.find((o) => o.v === valor);
  return (
    <details className="group relative">
      <summary
        className={cn(
          "flex h-7 cursor-pointer list-none items-center gap-1 rounded-[8px] border px-2 text-[0.8125rem] whitespace-nowrap transition-colors select-none [&::-webkit-details-marker]:hidden",
          atual ? "border-transparent bg-foreground text-white" : "border-border bg-background text-foreground hover:bg-accent",
        )}
      >
        {!atual && <Plus size={13} strokeWidth={2} aria-hidden />}
        {atual ? `${rotulo}: ${atual.t}` : rotulo}
        <ChevronDown size={13} strokeWidth={2} className="opacity-60" aria-hidden />
      </summary>
      <div className="absolute top-8 left-0 z-30 min-w-52 rounded-[12px] bg-popover p-1 shadow-[var(--shadow-float)]">
        {opcoes.map((o) => (
          <Link key={o.v} href={hrefCom(base, sp, { [chave]: o.v })} className={cn("flex h-8 items-center rounded-[8px] px-2.5 text-sm hover:bg-accent", o.v === valor && "font-medium")}>
            {o.t}
          </Link>
        ))}
        {atual && (
          <Link href={hrefCom(base, sp, { [chave]: undefined })} className="mt-1 flex h-8 items-center gap-1.5 rounded-[8px] border-t border-border px-2.5 text-sm text-muted-foreground hover:bg-accent">
            <X size={13} /> Limpar filtro
          </Link>
        )}
      </div>
    </details>
  );
}
