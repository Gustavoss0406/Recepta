import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowUpRight, Check, ChevronLeft, MessageCircle, Phone, Play } from "lucide-react";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";
import { Avatar, BadgeOrigem, BadgeStatus, dataCurta, Urgencia, type StatusRepasse } from "@/components/painel/pendencias";
import { Orb } from "@/components/ui/orb";
import { acaoAtualizarRepasse, acaoMudarStatusRepasse } from "../actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pendência" };

const PASSOS: { v: StatusRepasse; t: string }[] = [
  { v: "pendente", t: "Pendente" },
  { v: "em_andamento", t: "Em andamento" },
  { v: "resolvido", t: "Resolvido" },
];

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 truncate text-right text-foreground">{children}</span>
    </div>
  );
}

export default async function PendenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirPermissao("verLigacoes");
  const { id } = await params;
  const db = getDb();
  const [p] = await db
    .select()
    .from(schema.repasses)
    .where(and(eq(schema.repasses.orgId, s.org.id), eq(schema.repasses.id, id)));
  if (!p) notFound();
  const [membros, agente] = await Promise.all([
    db
      .select({ id: schema.usuarios.id, nome: schema.usuarios.nome })
      .from(schema.membros)
      .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.membros.usuarioId))
      .where(eq(schema.membros.orgId, s.org.id)),
    p.agenteId
      ? db
          .select({ nome: schema.agentes.nome })
          .from(schema.agentes)
          .where(eq(schema.agentes.id, p.agenteId))
          .then((r) => r[0])
      : undefined,
  ]);
  const resp = membros.find((m) => m.id === p.responsavelId);
  const falas = (p.trecho ?? "")
    .split("\n")
    .map((l) => {
      const m = l.match(/^(Cliente|Recepcionista): ([\s\S]*)$/);
      return m ? { cliente: m[1] === "Cliente", texto: m[2] } : null;
    })
    .filter((x): x is { cliente: boolean; texto: string } => !!x);
  const tel = p.contatoTelefone?.replace(/[^\d+]/g, "");
  const wa = tel?.replace(/^\+/, "");

  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 pt-6 pb-16 sm:px-8 sm:pt-8">
      <Link href="/painel/pendencias" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft size={15} /> Pendências
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <BadgeOrigem origem={p.origem} />
            <BadgeStatus status={p.status} />
          </div>
          <h1 className="mt-2 text-[1.375rem] leading-tight font-semibold tracking-[-0.02em] text-foreground">{p.titulo}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{p.id}</span> · {dataCurta(p.criadoEm)}
            {agente && <> · {agente.nome}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tel && (
            <a href={`tel:${tel}`} className="flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-white hover:bg-foreground/90">
              <Phone size={14} /> Ligar de volta
            </a>
          )}
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-sm text-foreground hover:bg-accent">
              <MessageCircle size={14} /> WhatsApp
            </a>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="rounded-[16px] border border-border bg-background">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <Orb tom="padrao" tamanho={28} />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Relatório da recepcionista</h2>
                <p className="text-xs text-muted-foreground">{p.origem === "automatico" ? "Gerado depois da ligação, porque ela não terminou bem" : "Escrito durante a ligação"}</p>
              </div>
            </div>
            <dl className="divide-y divide-border">
              {[
                { t: "O que o cliente quer", v: p.pedido },
                { t: "Por que veio para a equipe", v: p.motivo },
                { t: "Próximo passo sugerido", v: p.proximoPasso },
              ]
                .filter((x) => x.v)
                .map((x) => (
                  <div key={x.t} className="px-5 py-4">
                    <dt className="text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase">{x.t}</dt>
                    <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-foreground first-letter:uppercase">{x.v}</dd>
                  </div>
                ))}
              {p.dados && Object.keys(p.dados).length > 0 && (
                <div className="px-5 py-4">
                  <dt className="text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase">Dados coletados</dt>
                  <dd className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    {Object.entries(p.dados).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3 text-sm">
                        <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                        <span className="truncate text-foreground">{v}</span>
                      </div>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {falas.length > 0 && (
            <section className="rounded-[16px] border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold text-foreground">Trecho da ligação</h2>
                {p.conversaId && (
                  <Link href={`/painel/ligacoes/${p.conversaId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    <Play size={13} /> Ligação completa <ArrowUpRight size={13} />
                  </Link>
                )}
              </div>
              <ol className="space-y-2.5 px-5 py-4">
                {falas.map((f, i) => (
                  <li key={i} className={cn("flex", f.cliente ? "justify-end" : "justify-start")}>
                    <p
                      className={cn(
                        "max-w-[80%] rounded-[18px] px-3.5 py-2 text-sm leading-relaxed",
                        f.cliente ? "rounded-br-[6px] bg-foreground text-white" : "rounded-bl-[6px] bg-muted text-foreground",
                      )}
                    >
                      {f.texto}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="rounded-[16px] border border-border bg-background p-1.5">
            <p className="px-2.5 pt-2 pb-1.5 text-xs font-medium text-muted-foreground">Status</p>
            <div className="grid grid-cols-3 gap-0.5 rounded-[10px] bg-muted p-0.5">
              {PASSOS.map((st) => (
                <form key={st.v} action={acaoMudarStatusRepasse.bind(null, p.id, st.v)}>
                  <button
                    type="submit"
                    aria-pressed={p.status === st.v}
                    className={cn(
                      "flex h-8 w-full items-center justify-center gap-1 rounded-[8px] text-[0.8125rem] transition-[background,box-shadow] duration-200",
                      p.status === st.v ? "bg-background font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.06)]" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.status === st.v && st.v === "resolvido" && <Check size={13} />}
                    {st.t}
                  </button>
                </form>
              ))}
            </div>
            {p.resolvidoEm && <p className="px-2.5 pt-2 pb-1 text-xs text-muted-foreground">Resolvido em {dataCurta(p.resolvidoEm)}</p>}
          </section>

          <section className="divide-y divide-border rounded-[16px] border border-border bg-background">
            <Campo rotulo="Cliente">{p.contatoNome ?? "Não informado"}</Campo>
            <Campo rotulo="Telefone">{p.contatoTelefone ? <span className="font-mono text-[0.8125rem]">{p.contatoTelefone}</span> : "—"}</Campo>
            <Campo rotulo="Urgência">
              <Urgencia urgencia={p.urgencia} />
            </Campo>
            <Campo rotulo="Responsável">
              {resp ? (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar nome={resp.nome} className="size-5" /> {resp.nome}
                </span>
              ) : (
                "Ninguém"
              )}
            </Campo>
          </section>

          <form action={acaoAtualizarRepasse.bind(null, p.id)} className="space-y-3 rounded-[16px] border border-border bg-background p-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Responsável</span>
              <select name="responsavel" defaultValue={p.responsavelId ?? ""} className="h-9 w-full rounded-[10px] border border-input bg-background px-2.5 text-sm outline-none focus:border-foreground">
                <option value="">Ninguém</option>
                {membros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                    {m.id === s.usuario.id ? " (você)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Nota da equipe</span>
              <textarea
                name="nota"
                rows={4}
                defaultValue={p.nota ?? ""}
                placeholder="O que foi combinado com o cliente"
                className="w-full rounded-[10px] border border-input bg-background px-2.5 py-2 text-sm outline-none focus:border-foreground"
              />
            </label>
            <button type="submit" className="h-9 w-full rounded-full border border-border text-sm font-medium text-foreground hover:bg-accent">
              Salvar
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
