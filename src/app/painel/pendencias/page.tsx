import Link from "next/link";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { ChevronDown, Plus, X } from "lucide-react";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";
import { Avatar, BadgeOrigem, BadgeStatus, dataCurta, ORIGEM, Urgencia, URGENCIA, type OrigemRepasse, type StatusRepasse, type UrgenciaRepasse } from "@/components/painel/pendencias";
import { acaoNovoRepasse } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pendências" };

const ABAS: { v: StatusRepasse; t: string }[] = [
  { v: "pendente", t: "Pendente" },
  { v: "em_andamento", t: "Em andamento" },
  { v: "resolvido", t: "Resolvido" },
];

type SP = Record<string, string | undefined>;

function href(sp: SP, mudar: SP) {
  const qs = new URLSearchParams(Object.entries({ ...sp, ...mudar }).filter(([, v]) => v) as [string, string][]);
  const s = qs.toString();
  return `/painel/pendencias${s ? `?${s}` : ""}`;
}

function Filtro({ rotulo, valor, opcoes, sp, chave }: { rotulo: string; valor?: string; opcoes: { v: string; t: string }[]; sp: SP; chave: string }) {
  const atual = opcoes.find((o) => o.v === valor);
  return (
    <details className="group relative">
      <summary
        className={cn(
          "flex h-7 cursor-pointer list-none items-center gap-1 rounded-[8px] border px-2 text-[0.8125rem] transition-colors select-none [&::-webkit-details-marker]:hidden",
          atual ? "border-transparent bg-foreground text-white" : "border-border bg-background text-foreground hover:bg-accent",
        )}
      >
        {!atual && <Plus size={13} strokeWidth={2} aria-hidden />}
        {atual ? `${rotulo}: ${atual.t}` : rotulo}
        <ChevronDown size={13} strokeWidth={2} className="opacity-60" aria-hidden />
      </summary>
      <div className="absolute top-8 left-0 z-20 min-w-52 rounded-[12px] bg-popover p-1 shadow-[var(--shadow-float)]">
        {opcoes.map((o) => (
          <Link key={o.v} href={href(sp, { [chave]: o.v })} className={cn("flex h-8 items-center rounded-[8px] px-2.5 text-sm hover:bg-accent", o.v === valor && "font-medium")}>
            {o.t}
          </Link>
        ))}
        {atual && (
          <Link href={href(sp, { [chave]: undefined })} className="mt-1 flex h-8 items-center gap-1.5 rounded-[8px] border-t border-border px-2.5 text-sm text-muted-foreground hover:bg-accent">
            <X size={13} /> Limpar filtro
          </Link>
        )}
      </div>
    </details>
  );
}

export default async function PendenciasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await exigirPermissao("verLigacoes");
  const sp = await searchParams;
  const db = getDb();
  const r = schema.repasses;
  const status = (ABAS.some((a) => a.v === sp.status) ? sp.status : "pendente") as StatusRepasse;

  const filtros: SQL[] = [eq(r.orgId, s.org.id), eq(r.status, status)];
  if (sp.origem && sp.origem in ORIGEM) filtros.push(eq(r.origem, sp.origem as OrigemRepasse));
  if (sp.urgencia && sp.urgencia in URGENCIA) filtros.push(eq(r.urgencia, sp.urgencia as UrgenciaRepasse));
  if (sp.responsavel === "eu") filtros.push(eq(r.responsavelId, s.usuario.id));
  else if (sp.responsavel === "ninguem") filtros.push(isNull(r.responsavelId));

  const [lista, contagem] = await Promise.all([
    db
      .select({ r, responsavel: schema.usuarios.nome })
      .from(r)
      .leftJoin(schema.usuarios, eq(schema.usuarios.id, r.responsavelId))
      .where(and(...filtros))
      .orderBy(sql`case ${r.urgencia} when 'alta' then 0 when 'media' then 1 else 2 end`, desc(r.criadoEm))
      .limit(200),
    db
      .select({ status: r.status, n: sql<number>`count(*)::int` })
      .from(r)
      .where(eq(r.orgId, s.org.id))
      .groupBy(r.status),
  ]);
  const n = Object.fromEntries(contagem.map((c) => [c.status, c.n])) as Partial<Record<StatusRepasse, number>>;

  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 pt-8 pb-16 sm:px-8 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-foreground">Pendências</h1>
          <p className="mt-1 max-w-[560px] text-sm text-muted-foreground">
            Casos que a recepcionista passou para a equipe: quando não teve certeza, quando o cliente pediu retorno ou quando a ligação não terminou bem. Abra um para resolver.
          </p>
        </div>
        <nav aria-label="Status" className="flex rounded-[10px] bg-muted p-0.5">
          {ABAS.map((a) => (
            <Link
              key={a.v}
              href={href({ ...sp, status: undefined }, { status: a.v === "pendente" ? undefined : a.v })}
              aria-current={status === a.v ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-sm transition-[background,box-shadow,color] duration-200",
                status === a.v ? "bg-background font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.06)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {a.t}
              {!!n[a.v] && a.v !== "resolvido" && <span className="text-xs text-muted-foreground tabular-nums">{n[a.v]}</span>}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-5 overflow-hidden rounded-[16px] border border-border bg-background">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2.5">
          <Filtro rotulo="Origem" chave="origem" valor={sp.origem} sp={sp} opcoes={(["agente", "automatico", "manual"] as const).map((v) => ({ v, t: ORIGEM[v].texto }))} />
          <Filtro rotulo="Urgência" chave="urgencia" valor={sp.urgencia} sp={sp} opcoes={(["alta", "media", "baixa"] as const).map((v) => ({ v, t: URGENCIA[v].texto }))} />
          <Filtro
            rotulo="Responsável"
            chave="responsavel"
            valor={sp.responsavel}
            sp={sp}
            opcoes={[
              { v: "eu", t: "Comigo" },
              { v: "ninguem", t: "Sem responsável" },
            ]}
          />
          <Link href={href(sp, { novo: "1" })} className="ml-auto flex h-7 items-center gap-1 rounded-[8px] border border-border px-2 text-[0.8125rem] text-foreground hover:bg-accent">
            <Plus size={13} strokeWidth={2} aria-hidden /> Novo caso
          </Link>
        </div>

        {lista.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-20 text-center">
            <p className="text-[0.9375rem] font-medium text-foreground">{status === "pendente" ? "Nada pendente" : status === "em_andamento" ? "Nenhum caso em andamento" : "Nenhum caso resolvido ainda"}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {status === "pendente"
                ? "Quando a recepcionista não tiver certeza de como resolver, o caso chega aqui com um relatório pronto."
                : "Os casos aparecem aqui conforme a equipe avança neles."}
            </p>
          </div>
        ) : (
          <table className="w-full table-fixed text-left">
            <thead className="hidden md:table-header-group">
              <tr className="text-[0.6875rem] tracking-[0.06em] text-muted-foreground uppercase">
                <th className="py-2.5 pr-4 pl-4 font-normal">Título</th>
                <th className="w-[200px] py-2.5 pr-4 font-normal">Origem</th>
                <th className="w-[96px] py-2.5 pr-4 font-normal">Urgência</th>
                <th className="w-[150px] py-2.5 pr-4 font-normal">Responsável</th>
                <th className="w-[112px] py-2.5 pr-4 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(({ r: p, responsavel }) => (
                <tr key={p.id} className="group relative border-t border-border first:border-t-0 md:first:border-t">
                  <td className="py-3 pr-4 pl-4">
                    <Link href={`/painel/pendencias/${p.id}`} className="block after:absolute after:inset-0 after:content-['']">
                      <span className="line-clamp-2 block text-sm text-foreground">{p.titulo}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        <span className="font-mono">{p.id.slice(0, 12)}</span> · {dataCurta(p.criadoEm)}
                        {p.contatoTelefone && <span className="md:hidden"> · {p.contatoTelefone}</span>}
                      </span>
                    </Link>
                    <span className="mt-2 flex flex-wrap items-center gap-2 md:hidden">
                      <BadgeOrigem origem={p.origem} />
                      <BadgeStatus status={p.status} />
                      <Urgencia urgencia={p.urgencia} />
                    </span>
                  </td>
                  <td className="hidden py-3 pr-4 md:table-cell">
                    <BadgeOrigem origem={p.origem} />
                  </td>
                  <td className="hidden py-3 pr-4 md:table-cell">
                    <Urgencia urgencia={p.urgencia} />
                  </td>
                  <td className="hidden py-3 pr-4 md:table-cell">
                    {responsavel ? (
                      <span className="flex items-center gap-2 text-sm text-foreground">
                        <Avatar nome={responsavel} />
                        <span className="truncate">{responsavel.split(" ")[0]}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="hidden py-3 pr-4 text-right md:table-cell">
                    <BadgeStatus status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {sp.novo === "1" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="novo-caso">
          <Link href={href(sp, { novo: undefined, erro: undefined })} className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" aria-label="Fechar" />
          <form action={acaoNovoRepasse} className="relative w-full max-w-[460px] rounded-t-[20px] bg-background p-5 shadow-[var(--shadow-float)] sm:rounded-[20px]">
            <div className="flex items-center justify-between">
              <h2 id="novo-caso" className="text-[0.9375rem] font-semibold text-foreground">
                Novo caso
              </h2>
              <Link href={href(sp, { novo: undefined, erro: undefined })} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent" aria-label="Fechar">
                <X size={16} />
              </Link>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Para algo que chegou por outro canal e a equipe precisa acompanhar.</p>
            <div className="mt-4 space-y-3">
              {sp.erro && <p className="text-sm text-destructive">Descreva o que o cliente quer.</p>}
              <label className="block">
                <span className="mb-1 block text-sm text-foreground">O que o cliente quer</span>
                <textarea name="pedido" rows={3} required className="w-full rounded-[10px] border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm text-foreground">Nome</span>
                  <input name="nome" className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-foreground" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-foreground">Telefone</span>
                  <input name="telefone" inputMode="tel" className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-foreground" />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm text-foreground">Urgência</span>
                <select name="urgencia" defaultValue="media" className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-foreground">
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                </select>
              </label>
            </div>
            <button type="submit" className="mt-5 h-10 w-full rounded-full bg-foreground text-sm font-medium text-white hover:bg-foreground/90">
              Criar caso
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
