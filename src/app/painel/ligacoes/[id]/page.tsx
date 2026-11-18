import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, sum } from "drizzle-orm";
import { ArrowUpRight, ChevronLeft, Flag, Inbox } from "lucide-react";
import { getDb, schema } from "@/db/client";
import { exigirPermissao, pode } from "@/server/auth/session";
import { BOTAO } from "@/components/painel/page-header";
import { BadgeResultado, CANAIS } from "@/components/painel/badges";
import { dataCurta } from "@/components/painel/pendencias";
import { Orb } from "@/components/ui/orb";
import { GravacaoLigacao } from "@/components/painel/gravacao";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { alternarSinalizada, excluirDadosTitular, transformarEmTeste } from "../actions";

export const metadata = { title: "Ligação" };

const ABAS = [
  { v: "visao", t: "Visão geral" },
  { v: "transcricao", t: "Transcrição" },
  { v: "dados", t: "Dados do cliente" },
] as const;

const FERRAMENTAS: Record<string, string> = {
  consultar_horarios: "Consultou a agenda",
  agendar: "Agendou",
  transferir_para_humano: "Transferiu para a equipe",
  repassar_para_equipe: "Passou o caso para a equipe",
  anotar_recado: "Passou o caso para a equipe",
  enviar_whatsapp: "Enviou WhatsApp",
  encerrar_ligacao: "Encerrou a ligação",
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 3 });

export default async function LigacaoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const s = await exigirPermissao("verLigacoes");
  const { id } = await params;
  const pedida = (await searchParams).aba;
  const aba = ABAS.find((a) => a.v === pedida)?.v ?? "visao";
  const db = getDb();
  const [c] = await db
    .select()
    .from(schema.conversas)
    .where(and(eq(schema.conversas.orgId, s.org.id), eq(schema.conversas.id, id)));
  if (!c) notFound();
  const [turnos, acoes, [versao], [agente], [custo], [repasse]] = await Promise.all([
    db.select().from(schema.turnos).where(eq(schema.turnos.conversaId, id)).orderBy(asc(schema.turnos.ordem)),
    db.select().from(schema.chamadasFerramenta).where(eq(schema.chamadasFerramenta.conversaId, id)).orderBy(asc(schema.chamadasFerramenta.criadoEm)),
    c.versaoId ? db.select().from(schema.agenteVersoes).where(eq(schema.agenteVersoes.id, c.versaoId)) : Promise.resolve([]),
    db.select({ nome: schema.agentes.nome }).from(schema.agentes).where(eq(schema.agentes.id, c.agenteId)),
    db.select({ brl: sum(schema.registroCusto.custoBrl) }).from(schema.registroCusto).where(eq(schema.registroCusto.conversaId, id)),
    db.select({ id: schema.repasses.id, status: schema.repasses.status }).from(schema.repasses).where(eq(schema.repasses.conversaId, id)).limit(1),
  ]);
  const meta: [string, React.ReactNode][] = [
    ["Data", dataCurta(c.iniciadaEm)],
    ["Duração", formatDuration(c.duracaoS)],
    ["Canal", CANAIS[c.canal] ?? c.canal],
    ["De", c.de ? <span className="font-mono text-[0.8125rem]">{c.de}</span> : "Número oculto"],
    ["Minutos cobrados", `${c.minutosCobrados}${c.pico ? " (pico)" : ""}`],
    ["Custo de processamento", custo?.brl ? brl.format(Number(custo.brl)) : "—"],
    ["Versão", versao ? `v${versao.numero}` : "Rascunho"],
    ["Sentimento", c.sentimento ? <span className="capitalize">{c.sentimento}</span> : "—"],
  ];

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pt-5 pb-16 sm:px-8 sm:pt-6">
      <Link href="/painel/ligacoes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft size={15} /> Ligações
      </Link>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 rounded-[18px] border border-border bg-background">
          <div className="px-5 pt-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Orb tom="padrao" tamanho={32} />
                <div className="min-w-0">
                  <h1 className="truncate text-[1.0625rem] font-semibold tracking-[-0.01em] text-foreground">Ligação com {agente?.nome ?? "a recepcionista"}</h1>
                  <p className="truncate font-mono text-xs text-muted-foreground">{c.id}</p>
                </div>
              </div>
              <form action={alternarSinalizada.bind(null, id)}>
                <button type="submit" className={cn(BOTAO.secundario, "h-8 px-3")}>
                  <Flag size={13} className={c.sinalizada ? "fill-[#e5484d] text-[#e5484d]" : ""} /> {c.sinalizada ? "Sinalizada" : "Sinalizar"}
                </button>
              </form>
            </div>
            <GravacaoLigacao conversaId={c.id} duracaoS={c.duracaoS} temAudio={Boolean(c.audioChave)} picos={c.audioPicos} />
            <nav aria-label="Seções da ligação" className="mt-4 flex gap-5 border-b border-border">
              {ABAS.map((a) => (
                <Link
                  key={a.v}
                  href={`/painel/ligacoes/${id}${a.v === "visao" ? "" : `?aba=${a.v}`}`}
                  aria-current={aba === a.v ? "page" : undefined}
                  className={cn("-mb-px border-b-2 pb-2.5 text-sm", aba === a.v ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
                >
                  {a.t}
                </Link>
              ))}
            </nav>
          </div>

          <div className="px-5 py-5 sm:px-6">
            {aba === "visao" && (
              <div>
                <h2 className="text-sm font-medium text-foreground">Resumo</h2>
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-foreground">{c.resumo ?? "A análise aparece quando a ligação termina."}</p>
                <dl className="mt-5 divide-y divide-border border-y border-border">
                  <div className="flex items-center justify-between py-3">
                    <dt className="text-sm text-foreground">Resultado</dt>
                    <dd>
                      <BadgeResultado resultado={c.resultado} />
                    </dd>
                  </div>
                  <div className="py-3">
                    <div className="flex items-center justify-between">
                      <dt className="text-sm text-foreground">Avaliação</dt>
                      <dd>
                        {c.avaliacao ? (
                          <span className={cn("rounded-[6px] px-1.5 py-0.5 text-xs font-medium", c.avaliacao.sucesso ? "bg-[#e9f7ef] text-[#147a3d]" : "bg-[#fdecec] text-[#b42318]")}>
                            {c.avaliacao.sucesso ? "Sucesso" : "Falha"}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </dd>
                    </div>
                    {c.avaliacao?.justificativa && <p className="mt-1.5 pl-3 text-sm text-muted-foreground">{c.avaliacao.justificativa}</p>}
                  </div>
                  {acoes.length > 0 && (
                    <div className="py-3">
                      <dt className="text-sm text-foreground">O que a recepcionista fez</dt>
                      <dd className="mt-2 flex flex-wrap gap-1.5">
                        {acoes.map((a) => (
                          <span key={a.id} className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground">
                            {FERRAMENTAS[a.nome] ?? a.nome.replaceAll("_", " ")}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
                {repasse && (
                  <Link href={`/painel/pendencias/${repasse.id}`} className="mt-4 flex items-center gap-3 rounded-[12px] bg-[#eaf1fe] px-4 py-3 text-sm text-[#1d4fd7]">
                    <Inbox size={15} /> Esta ligação virou uma pendência para a equipe ({repasse.status === "resolvido" ? "resolvida" : repasse.status === "em_andamento" ? "em andamento" : "pendente"})
                    <ArrowUpRight size={14} className="ml-auto" />
                  </Link>
                )}
              </div>
            )}

            {aba === "transcricao" && (
              <ol className="space-y-3">
                {turnos.map((t) => (
                  <li key={t.id} className={cn("flex items-end gap-2", t.papel === "cliente" && "flex-row-reverse")}>
                    {t.papel === "agente" && <Orb tom="padrao" tamanho={22} />}
                    {t.papel === "sistema" ? (
                      <p className="mx-auto text-xs text-muted-foreground">{t.texto}</p>
                    ) : (
                      <div className={cn("max-w-[78%]", t.papel === "cliente" && "text-right")}>
                        <p
                          className={cn(
                            "inline-block rounded-[18px] px-3.5 py-2 text-left text-sm leading-relaxed",
                            t.papel === "cliente" ? "rounded-br-[6px] bg-foreground text-white" : "rounded-bl-[6px] bg-muted text-foreground",
                          )}
                        >
                          {t.texto}
                        </p>
                        <p className="mt-1 px-1 font-mono text-[0.6875rem] text-muted-foreground">{formatDuration(t.offsetMs / 1000)}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {aba === "dados" &&
              (c.dados && Object.keys(c.dados).length > 0 ? (
                <dl className="divide-y divide-border rounded-[14px] border border-border">
                  {Object.entries(c.dados).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                      <dt className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
                      <dd className="truncate text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum dado coletado nesta ligação. Configure os campos em Agente › Análise.</p>
              ))}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[18px] border border-border">
            <h2 className="px-4 pt-4 pb-2 text-sm font-semibold text-foreground">Metadados</h2>
            <dl className="divide-y divide-border">
              {meta.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="truncate text-right text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          {pode(s.papel, "editarAgente") && (
            <form action={transformarEmTeste.bind(null, id)} className="space-y-2.5 rounded-[18px] border border-border p-4">
              <p className="text-sm font-semibold text-foreground">Criar teste a partir desta ligação</p>
              <p className="text-xs text-muted-foreground">O começo desta ligação vira um cenário simulado da suíte.</p>
              <input name="criterio" placeholder="Critério de sucesso (opcional)" className="field !h-9" />
              <select name="severidade" defaultValue="importante" className="field !h-9">
                <option value="critico">Crítico (bloqueia publicação)</option>
                <option value="importante">Importante</option>
                <option value="informativo">Informativo</option>
              </select>
              <button type="submit" className={cn(BOTAO.primario, "h-8 w-full")}>
                Criar teste
              </button>
            </form>
          )}
          {pode(s.papel, "configurarLgpd") && (
            <form action={excluirDadosTitular.bind(null, id)} className="px-1">
              <button type="submit" className="text-xs text-destructive hover:underline">
                Excluir dados do titular (LGPD)
              </button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
