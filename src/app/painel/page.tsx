import { FaixaAnuncio, PromptRecepta, BannerRotativo } from "@/components/painel/inicio-vivo";
import { fotos } from "@/server/fotos";
import { BUSCAS_UNSPLASH } from "@/server/fotos/unsplash";
import { GRADIENTES, MODELOS } from "@/lib/fotos";
import { AudioLines, Blocks, BookOpen, CalendarDays, Inbox, Mic, PhoneCall, Workflow } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { ArrowRight, ArrowUpRight, Bell, ChevronRight } from "lucide-react";
import { getDb, schema } from "@/db/client";
import { exigirSessao } from "@/server/auth/session";
import { resumoCobranca } from "@/server/billing/assinaturas";
import { primeiroAgente } from "@/server/agent/agentes";
import { BOTAO, COLUNA, Segmentado } from "@/components/painel/page-header";
import { BadgeResultado } from "@/components/painel/badges";
import { BadgeOrigem, dataCurta, Urgencia } from "@/components/painel/pendencias";
import { SerieMetrica, type Ponto } from "@/components/charts/serie-metrica";
import { formatarMetrica, type Formato } from "@/lib/metricas";
import { Orb } from "@/components/ui/orb";
import { partesLocais } from "@/lib/agent/agenda";
import { formatDuration, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERIODOS = [
  { v: "7", t: "7 dias" },
  { v: "30", t: "30 dias" },
  { v: "90", t: "90 dias" },
] as const;

type MetricaId = "ligacoes" | "duracao" | "resolucao" | "repasses" | "minutos";
const METRICAS: { id: MetricaId; nome: string; formato: Formato }[] = [
  { id: "ligacoes", nome: "Ligações", formato: "int" },
  { id: "duracao", nome: "Duração média", formato: "duracao" },
  { id: "resolucao", nome: "Resolvidas sozinha", formato: "pct" },
  { id: "repasses", nome: "Passadas à equipe", formato: "int" },
  { id: "minutos", nome: "Minutos", formato: "int" },
];

function diasAte(hoje: string, n: number): string[] {
  const base = new Date(`${hoje}T12:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** Photos already in the project, used while the CC0 set is still downloading. */
const RESERVA = ["/fotos/clinica.jpg", "/fotos/restaurante.jpg", "/fotos/salao.jpg", "/fotos/imobiliaria.jpg", "/fotos/odontologia.jpg"];

const ATALHOS = (agenteId?: string) => [
  { rotulo: "Testar", href: agenteId ? `/painel/agentes/${agenteId}#testar` : "/painel/comecar", icone: AudioLines },
  { rotulo: "Fluxo", href: agenteId ? `/painel/agentes/${agenteId}?aba=workflow` : "/painel/comecar", icone: Workflow },
  { rotulo: "Vozes", href: agenteId ? `/painel/agentes/${agenteId}?aba=voz` : "/painel/comecar", icone: Mic },
  { rotulo: "Agenda", href: "/painel/agenda", icone: CalendarDays },
  { rotulo: "Ligações", href: "/painel/ligacoes", icone: PhoneCall },
  { rotulo: "Pendências", href: "/painel/pendencias", icone: Inbox },
  { rotulo: "Conhecimento", href: agenteId ? `/painel/agentes/${agenteId}?aba=conhecimento` : "/painel/comecar", icone: BookOpen },
  { rotulo: "Integrações", href: "/painel/integracoes", icone: Blocks },
];

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ publicado?: string; periodo?: string; m?: string }> }) {
  const s = await exigirSessao();
  if (!s.org.onboardingConcluido && !(await primeiroAgente(s.org.id))) redirect("/painel/comecar");
  const sp = await searchParams;
  const db = getDb();
  const F = await fotos(Object.keys(BUSCAS_UNSPLASH));
  const foto = (slug: string) => F[slug]?.src ?? null;
  const creditosBanner = [...new Map(["atendimento", "cidade-noite", "headset", "recepcao", "clinica", "salao", "academia", "veterinaria", "equipe", "advocacia", "oficina", "escola", "imobiliaria", "restaurante", "petshop"].map((x) => F[x]?.credito).filter((c): c is NonNullable<typeof c> => Boolean(c)).map((c) => [c.autor, c])).values()];
  const periodo = PERIODOS.some((p) => p.v === sp.periodo) ? (sp.periodo as "7" | "30" | "90") : "7";
  const metrica = METRICAS.find((m) => m.id === sp.m) ?? METRICAS[0];
  const n = Number(periodo);
  const desde = new Date(Date.now() - n * 86_400_000);
  const c = schema.conversas;
  const dia = sql<string>`to_char(${c.iniciadaEm} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;
  const base = and(eq(c.orgId, s.org.id), eq(c.teste, false), gte(c.iniciadaEm, desde));
  const r = schema.repasses;

  const [porDia, [tot], repDia, pendentes, motivos, recentes, alertas, cob, agente] = await Promise.all([
    db
      .select({
        dia,
        ligacoes: sql<number>`count(*)::int`,
        duracao: sql<number>`coalesce(avg(${c.duracaoS}) filter (where ${c.status} = 'encerrada'), 0)::float`,
        encerradas: sql<number>`count(*) filter (where ${c.status} = 'encerrada')::int`,
        resolvidas: sql<number>`count(*) filter (where ${c.resultado} = 'resolvido')::int`,
        minutos: sql<number>`coalesce(sum(${c.minutosCobrados}), 0)::int`,
      })
      .from(c)
      .where(base)
      .groupBy(dia),
    db
      .select({
        ligacoes: sql<number>`count(*)::int`,
        duracao: sql<number>`coalesce(avg(${c.duracaoS}) filter (where ${c.status} = 'encerrada'), 0)::float`,
        encerradas: sql<number>`count(*) filter (where ${c.status} = 'encerrada')::int`,
        resolvidas: sql<number>`count(*) filter (where ${c.resultado} = 'resolvido')::int`,
        minutos: sql<number>`coalesce(sum(${c.minutosCobrados}), 0)::int`,
      })
      .from(c)
      .where(base),
    db
      .select({ dia: sql<string>`to_char(${r.criadoEm} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(r)
      .where(and(eq(r.orgId, s.org.id), ne(r.origem, "manual"), gte(r.criadoEm, desde)))
      .groupBy(sql`1`),
    db
      .select()
      .from(r)
      .where(and(eq(r.orgId, s.org.id), eq(r.status, "pendente")))
      .orderBy(sql`case ${r.urgencia} when 'alta' then 0 when 'media' then 1 else 2 end`, desc(r.criadoEm))
      .limit(5),
    db
      .select({
        motivo: c.motivo,
        n: sql<number>`count(*)::int`,
        resolvidas: sql<number>`count(*) filter (where ${c.resultado} = 'resolvido')::int`,
        negativas: sql<number>`count(*) filter (where ${c.sentimento} = 'negativo')::int`,
      })
      .from(c)
      .where(and(base, sql`${c.motivo} is not null`))
      .groupBy(c.motivo)
      .orderBy(desc(sql`count(*)`))
      .limit(6),
    db.select().from(c).where(and(eq(c.orgId, s.org.id), eq(c.teste, false))).orderBy(desc(c.iniciadaEm)).limit(6),
    db
      .select()
      .from(schema.alertas)
      .where(and(eq(schema.alertas.orgId, s.org.id), eq(schema.alertas.lido, false)))
      .orderBy(desc(schema.alertas.criadoEm))
      .limit(3),
    resumoCobranca(s.org.id),
    primeiroAgente(s.org.id),
  ]);

  const repassesTotal = repDia.reduce((a, x) => a + x.n, 0);
  const mapa = new Map(porDia.map((d) => [d.dia, d]));
  const mapaRep = new Map(repDia.map((d) => [d.dia, d.n]));
  const pontos: Ponto[] = diasAte(partesLocais(new Date()).data, n).map((d) => {
    const x = mapa.get(d);
    const valor =
      metrica.id === "ligacoes"
        ? (x?.ligacoes ?? 0)
        : metrica.id === "duracao"
          ? (x?.duracao ?? 0)
          : metrica.id === "resolucao"
            ? x?.encerradas
              ? (x.resolvidas / x.encerradas) * 100
              : 0
            : metrica.id === "repasses"
              ? (mapaRep.get(d) ?? 0)
              : (x?.minutos ?? 0);
    return { data: d, valor };
  });
  const valores: Record<MetricaId, number> = {
    ligacoes: tot.ligacoes,
    duracao: tot.duracao,
    resolucao: tot.encerradas ? (tot.resolvidas / tot.encerradas) * 100 : 0,
    repasses: repassesTotal,
    minutos: tot.minutos,
  };
  const url = (m: Partial<{ periodo: string; m: string }>) => {
    const q = new URLSearchParams(Object.entries({ periodo: sp.periodo, m: sp.m, ...m }).filter(([, v]) => v) as [string, string][]);
    return `/painel${q.size ? `?${q}` : ""}`;
  };
  const statusAgente = agente?.status === "publicado" ? "No ar" : agente?.status === "pausado" ? "Pausada" : "Rascunho";

  return (
    <div className="pb-16">
      <FaixaAnuncio
        id="me-ligue"
        texto="Novo"
        destaque="Teste sua recepcionista numa ligação de verdade"
        href={agente ? `/painel/agentes/${agente.id}#testar` : "/painel/comecar"}
        acao="Me ligue agora"
        fotos={["atendimento", "headset", "clinica", "imobiliaria", "restaurante", "petshop"].map(foto).filter((x): x is string => Boolean(x))}
      />
      <section className={cn(COLUNA, "pt-8 sm:pt-12")}>
        <PromptRecepta nome={s.usuario.nome.split(" ")[0]} agenteId={agente?.id ?? null} />
        <nav aria-label="Atalhos" className="mx-auto mt-8 grid max-w-[820px] grid-cols-4 gap-y-5 sm:grid-cols-8">
          {ATALHOS(agente?.id).map((a) => (
            <Link key={a.rotulo} href={a.href} className="group flex flex-col items-center gap-2 text-center">
              <span className="grid size-11 place-items-center rounded-[14px] border border-border bg-white shadow-[0_1px_2px_rgba(0,0,0,.04)] transition-transform group-hover:-translate-y-0.5">
                <a.icone size={19} strokeWidth={1.6} className="text-foreground" />
              </span>
              <span className="text-[0.8125rem] text-foreground">{a.rotulo}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-8">
          <BannerRotativo
            slides={[
              { linha1: "Atende toda ligação,", linha2: "24 horas por dia", fotos: [foto("atendimento"), foto("cidade-noite"), foto("headset"), foto("recepcao")].map((x, k) => x ?? RESERVA[k % RESERVA.length]), href: agente ? `/painel/agentes/${agente.id}?aba=workflow` : "/painel/comecar" },
              { linha1: "Do alô ao", linha2: "horário marcado na agenda", fotos: [foto("clinica"), foto("salao"), foto("academia"), foto("veterinaria")].map((x, k) => x ?? RESERVA[k % RESERVA.length]), href: "/painel/agenda" },
              { linha1: "Na dúvida, passa o caso", linha2: "pronto pra sua equipe", fotos: [foto("equipe"), foto("advocacia"), foto("oficina"), foto("escola")].map((x, k) => x ?? RESERVA[k % RESERVA.length]), href: "/painel/pendencias" },
              { linha1: "Conecte WhatsApp,", linha2: "CRM e agenda em 1 minuto", fotos: [foto("imobiliaria"), foto("restaurante"), foto("petshop"), foto("recepcao")].map((x, k) => x ?? RESERVA[k % RESERVA.length]), href: "/painel/integracoes" },
            ]}
          />
          {creditosBanner.length > 0 && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Fotos:{" "}
              {creditosBanner.slice(0, 6).map((c, k) => (
                <span key={c.autor}>
                  {k > 0 && ", "}
                  <a href={c.autorUrl} target="_blank" rel="noopener" className="hover:underline">
                    {c.autor}
                  </a>
                </span>
              ))}{" "}
              no{" "}
              <a href={creditosBanner[0].pagina} target="_blank" rel="noopener" className="hover:underline">
                Unsplash
              </a>
            </p>
          )}
        </div>
      </section>

      <section className={cn(COLUNA, "mt-12")}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium tracking-[-0.01em]">Modelos prontos</h2>
            <p className="text-sm text-muted-foreground">Uma recepcionista sob medida pra cada tipo de negócio, montada numa conversa.</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {MODELOS.map((m, i) => {
            const f = foto(m.slug);
            return (
              <Link
                key={m.slug}
                href={`/painel/comecar?conversa=1&negocio=${encodeURIComponent(m.negocio)}`}
                className="group relative block aspect-[4/3] overflow-hidden rounded-[16px]"
                style={{ background: GRADIENTES[i % GRADIENTES.length] }}
              >
                {f && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-3 pt-10 pb-2.5 text-sm font-medium text-white">{m.titulo}</span>
                {F[m.slug]?.credito && (
                  <span className="absolute top-2 right-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white/90 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                    Foto: {F[m.slug]!.credito!.autor} · Unsplash
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <header className={cn(COLUNA, "pt-12")}>
        <p className="text-[0.8125rem] text-muted-foreground">{s.org.nome}</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-lg font-medium tracking-[-0.01em] text-foreground">Seu atendimento</h1>
          {agente && (
            <Link href={`/painel/agentes/${agente.id}`} className="group flex items-center gap-2.5 rounded-full border border-border py-1 pr-3 pl-1 transition-colors hover:bg-accent">
              <Orb tom="padrao" tamanho={28} />
              <span className="text-sm text-foreground">{agente.nome}</span>
              <span className={cn("flex items-center gap-1 text-xs", agente.status === "publicado" ? "text-[#147a3d]" : "text-muted-foreground")}>
                <span className={cn("size-1.5 rounded-full", agente.status === "publicado" ? "bg-[#22a35a]" : "bg-[#a3a3a3]")} aria-hidden />
                {statusAgente}
              </span>
              <ChevronRight size={14} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </header>

      {(sp.publicado || !s.org.onboardingConcluido || alertas.length > 0) && (
        <div className={cn(COLUNA, "mt-5 space-y-2")}>
          {sp.publicado && (
            <p className="rounded-[12px] bg-[#e9f7ef] px-4 py-3 text-sm text-[#147a3d]">Sua recepcionista está no ar. Cada ligação aparece em Ligações, e o que ela não resolver chega em Pendências.</p>
          )}
          {!s.org.onboardingConcluido && (
            <Link href="/painel/comecar" className="flex items-center justify-between gap-4 rounded-[14px] border border-border p-4 transition-colors hover:bg-accent">
              <div>
                <p className="text-sm font-medium text-foreground">Configure sua recepcionista em 7 passos</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Passo {s.org.onboardingPasso} de 7 · cerca de 5 minutos</p>
                <div className="mt-2.5 h-1 w-56 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground" style={{ width: `${((s.org.onboardingPasso - 1) / 7) * 100}%` }} />
                </div>
              </div>
              <ArrowRight size={16} />
            </Link>
          )}
          {alertas.map((a) => (
            <p key={a.id} className="flex items-center gap-3 rounded-[12px] bg-[#fdf6d8] px-4 py-3 text-sm text-[#7a5b00]">
              <Bell size={15} /> {a.mensagem}
              <Link href="/painel/cobranca" className="ml-auto underline underline-offset-2">
                Ver uso
              </Link>
            </p>
          ))}
        </div>
      )}

      <section className={cn(COLUNA, "mt-7")}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Segmentado rotulo="Período" valor={periodo} opcoes={PERIODOS.map((p) => ({ v: p.v, t: p.t }))} href={(v) => url({ periodo: v === "7" ? undefined : v })} />
          <span className="ml-auto text-xs text-muted-foreground">
            {formatInt(cob.usadosFranquia)} de {formatInt(cob.incluidos)} min no ciclo · {cob.plano.name}
          </span>
        </div>
        <div className="overflow-hidden rounded-[18px] border border-border bg-background">
          <nav aria-label="Métrica do gráfico" className="grid grid-cols-2 border-b border-border bg-surface sm:grid-cols-3 lg:grid-cols-5">
            {METRICAS.map((m) => {
              const ativo = m.id === metrica.id;
              return (
                <Link
                  key={m.id}
                  href={url({ m: m.id === "ligacoes" ? undefined : m.id })}
                  aria-current={ativo ? "true" : undefined}
                  scroll={false}
                  className={cn(
                    "relative px-4 py-3.5 transition-colors sm:px-5",
                    ativo ? "bg-background" : "hover:bg-background/60",
                    "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5",
                    ativo && "after:bg-foreground",
                  )}
                >
                  <span className={cn("block text-[0.8125rem]", ativo ? "text-foreground" : "text-muted-foreground")}>{m.nome}</span>
                  <span className={cn("mt-1 block text-[1.375rem] leading-none font-semibold tracking-[-0.025em] tabular-nums", ativo ? "text-foreground" : "text-[#6b6b6b]")}>
                    {formatarMetrica(valores[m.id], m.formato)}
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="px-4 pt-5 pb-4 sm:px-6">
            <SerieMetrica pontos={pontos} formato={metrica.formato} nome={metrica.nome} />
            <div className="mt-4 flex justify-end">
              <Link href={`/painel/ligacoes?periodo=${periodo}`} className={cn(BOTAO.secundario, "h-8 px-3 text-[0.8125rem]")}>
                Ligações do período <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className={cn(COLUNA, "mt-8 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0")}>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Pendências</h2>
            <Link href="/painel/pendencias" className="text-sm text-muted-foreground hover:text-foreground">
              Ver todas
            </Link>
          </div>
          {pendentes.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-[16px] border border-border">
              {pendentes.map((p) => (
                <li key={p.id}>
                  <Link href={`/painel/pendencias/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-foreground">{p.titulo}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <Urgencia urgencia={p.urgencia} />
                        <span>· {dataCurta(p.criadoEm)}</span>
                      </p>
                    </div>
                    <BadgeOrigem origem={p.origem} compacto />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-[16px] border border-dashed border-border px-5 py-10 text-center">
              <p className="text-sm font-medium text-foreground">Nada pendente</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">Quando a recepcionista tiver dúvida, o caso chega aqui com o relatório pronto.</p>
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Motivos das ligações</h2>
            <Link href="/painel/analises" className="text-sm text-muted-foreground hover:text-foreground">
              Análises
            </Link>
          </div>
          {motivos.length ? (
            <div className="overflow-hidden rounded-[16px] border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-normal">Motivo</th>
                    <th className="w-20 px-2 py-2.5 text-right font-normal">Ligações</th>
                    <th className="w-28 px-4 py-2.5 text-right font-normal">Resolvidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {motivos.map((m) => {
                    const pct = Math.round((m.resolvidas / Math.max(1, m.n)) * 100);
                    return (
                      <tr key={m.motivo}>
                        <td className="max-w-0 truncate px-4 py-3 text-foreground">{m.motivo}</td>
                        <td className="px-2 py-3 text-right text-muted-foreground tabular-nums">{m.n}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", pct >= 80 ? "bg-[#e9f7ef] text-[#147a3d]" : pct >= 50 ? "bg-muted text-foreground" : "bg-[#fdecec] text-[#b42318]")}>
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-border px-5 py-10 text-center">
              <p className="text-sm font-medium text-foreground">Sem ligações no período</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">Os motivos aparecem aqui conforme as ligações são analisadas.</p>
            </div>
          )}
        </div>
      </section>

      <section className={cn(COLUNA, "mt-8")}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Últimas ligações</h2>
          <Link href="/painel/ligacoes" className="text-sm text-muted-foreground hover:text-foreground">
            Ver todas
          </Link>
        </div>
        {recentes.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-[16px] border border-border">
            {recentes.map((x) => (
              <li key={x.id}>
                <Link href={`/painel/ligacoes/${x.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-foreground">{x.resumo ?? x.motivo ?? "Ligação em andamento"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {x.de ?? "Número oculto"} · {dataCurta(x.iniciadaEm)} · {formatDuration(x.duracaoS)}
                    </p>
                  </div>
                  <BadgeResultado resultado={x.resultado} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-[16px] border border-dashed border-border px-5 py-10 text-center">
            <p className="text-sm font-medium text-foreground">Nenhuma ligação ainda</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">Quando a recepcionista estiver no ar, as ligações aparecem aqui com resumo e resultado.</p>
          </div>
        )}
      </section>
    </div>
  );
}
