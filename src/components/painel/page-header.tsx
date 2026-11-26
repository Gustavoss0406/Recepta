import { cn } from "@/lib/utils";

/** Content column of the panel (ElevenAgents centers page content; wide pages pass `largo`). */
export const COLUNA = "mx-auto w-full max-w-[1080px] px-4 sm:px-8";

export function PageHeader({
  titulo,
  descricao,
  acoes,
  voltar,
  selo,
  fundo,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  voltar?: React.ReactNode;
  selo?: React.ReactNode;
  /** Decorative background (e.g. <FundoFotos />). */
  fundo?: React.ReactNode;
}) {
  return (
    <header className={cn(COLUNA, "relative isolate pt-7 pb-1 sm:pt-10", fundo && "sm:pb-4")}>
      {fundo}
      {voltar && <div className="mb-3 text-sm text-muted-foreground [&_a:hover]:text-foreground">{voltar}</div>}
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[1.375rem] leading-tight font-semibold tracking-[-0.02em] text-foreground">{titulo}</h1>
            {selo}
          </div>
          {descricao && <p className="mt-1 max-w-[620px] text-sm text-muted-foreground">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    </header>
  );
}

export function Secao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={cn(COLUNA, "py-5", className)}>{children}</section>;
}

/** Inset grouped list (iOS Settings) used for settings and detail rows. */
export function Grupo({ titulo, rodape, children, className }: { titulo?: React.ReactNode; rodape?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      {titulo && <p className="px-1 pb-2 text-[0.8125rem] font-medium text-muted-foreground">{titulo}</p>}
      <div className="divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-background">{children}</div>
      {rodape && <p className="px-1 pt-2 text-xs text-muted-foreground">{rodape}</p>}
    </div>
  );
}

export function Linha({ rotulo, descricao, children }: { rotulo: React.ReactNode; descricao?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{rotulo}</p>
        {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
      </div>
      {children && <div className="shrink-0 text-sm text-foreground">{children}</div>}
    </div>
  );
}

export function Vazio({ titulo, texto, acao, icone, imagem }: { titulo: string; texto: string; acao?: React.ReactNode; icone?: React.ReactNode; imagem?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[16px] border border-dashed border-border bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,.05),transparent_60%)] px-6 py-14 text-center">
      {imagem && <div className="mb-5">{imagem}</div>}
      {!imagem && icone && <div className="mb-4 text-muted-foreground">{icone}</div>}
      <p className="text-[0.9375rem] font-medium text-foreground">{titulo}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{texto}</p>
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

export function Kpi({ rotulo, valor, detalhe }: { rotulo: string; valor: React.ReactNode; detalhe?: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-border bg-background p-4">
      <p className="text-[0.8125rem] text-muted-foreground">{rotulo}</p>
      <p className="mt-1.5 text-[1.5rem] leading-none font-semibold tracking-[-0.025em] text-foreground tabular-nums">{valor}</p>
      {detalhe && <p className="mt-1.5 text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

/** Apple-style segmented control rendered as links (server friendly). */
export function Segmentado<T extends string>({ opcoes, valor, href, rotulo }: { opcoes: { v: T; t: React.ReactNode }[]; valor: T; href: (v: T) => string; rotulo: string }) {
  return (
    <nav aria-label={rotulo} className="inline-flex rounded-[10px] bg-muted p-0.5">
      {opcoes.map((o) => (
        <a
          key={o.v}
          href={href(o.v)}
          aria-current={valor === o.v ? "page" : undefined}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-sm whitespace-nowrap transition-[background,box-shadow,color] duration-200",
            valor === o.v ? "bg-background font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.06)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.t}
        </a>
      ))}
    </nav>
  );
}

/** Small primary/secondary pill buttons matching the ElevenAgents header actions. */
export const BOTAO = {
  primario: "inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-foreground/85 disabled:opacity-40",
  secundario:
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-accent disabled:opacity-40",
  fantasma: "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-accent",
};
