import { Assistente } from "@/components/painel/assistente";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Upload,
} from "lucide-react";
import { Orb } from "@/components/ui/orb";
import { VOICES } from "@/lib/voices";
import { getDb, schema } from "@/db/client";
import { exigirSessao, pode } from "@/server/auth/session";
import {
  ErroAgente,
  listarAgentes,
  obterAgente,
  versoesDoAgente,
} from "@/server/agent/agentes";
import { Colegas } from "@/components/painel/colegas";
import { compilarPrompt } from "@/lib/agent/prompt";
import { BOTAO } from "@/components/painel/page-header";
import { WorkflowEditor } from "@/components/painel/workflow-editor";
import {
  ExperimentoAtivo,
  NovoExperimento,
} from "@/components/painel/experimento";
import {
  PLANOS_COM_AB,
  resultadoExperimento,
} from "@/server/agent/experimentos";
import { obterAssinatura } from "@/server/billing/assinaturas";
import { TestPanel } from "@/components/painel/test-panel";
import {
  SecaoAcoes,
  SecaoCanais,
  SecaoComportamento,
  SecaoDados,
  SecaoEmpresa,
  SecaoHorarios,
  SecaoSeguranca,
  SecaoVoz,
} from "@/components/painel/secoes";
import { Conhecimento } from "@/components/painel/conhecimento";
import { PublicarForm } from "@/components/painel/publicar";
import { acaoPausar, acaoRestaurar, salvarSecao } from "../../actions";
import { ttsConfigurado } from "@/server/voice/tts";

/** Same tab order as the ElevenAgents agent page (Agent, Voice, Knowledge, Tools, Analysis, Tests, Widget, Security, Advanced, Branches). */
const ABAS = [
  ["agente", "Agente"],
  ["workflow", "Workflow"],
  ["voz", "Voz"],
  ["conhecimento", "Conhecimento"],
  ["acoes", "Ferramentas"],
  ["dados", "Análise"],
  ["testes", "Testes"],
  ["canais", "Widget"],
  ["seguranca", "Segurança"],
  ["horarios", "Avançado"],
  ["versoes", "Versões"],
] as const;
const ANTIGAS: Record<string, string> = {
  visao: "agente",
  comportamento: "agente",
};

export default async function AgentePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const s = await exigirSessao();
  const { id } = await params;
  const pedida = (await searchParams).aba ?? "agente";
  const aba = ANTIGAS[pedida] ?? pedida;
  let agente;
  try {
    agente = await obterAgente(s.org.id, id);
  } catch (e) {
    if (e instanceof ErroAgente) notFound();
    throw e;
  }
  const db = getDb();
  const versoes = await versoesDoAgente(s.org.id, id);
  const publicada = versoes.find((v) => v.id === agente.versaoPublicadaId);
  const alterado = publicada
    ? agente.rascunhoAlteradoEm > publicada.criadoEm
    : true;
  const editar = pode(s.papel, "editarAgente");
  const cfg = agente.rascunho;
  const acao = (secao: Parameters<typeof salvarSecao>[1]) =>
    salvarSecao.bind(null, id, secao);
  const [assinatura, experimento] = await Promise.all([
    obterAssinatura(s.org.id),
    resultadoExperimento(id),
  ]);
  const podeAB = PLANOS_COM_AB.includes(assinatura.planoId);
  const h = await headers();
  const origem = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const statusSelo =
    agente.status === "pausado"
      ? { t: "Pausada", c: "bg-muted text-muted-foreground" }
      : publicada
        ? {
            t: `No ar · v${publicada.numero}`,
            c: "bg-[#e9f7ef] text-[#147a3d]",
          }
        : { t: "Rascunho", c: "bg-muted text-muted-foreground" };
  const voz = VOICES.find((v) => v.id === cfg.voz.vozId);

  return (
    <div className="flex min-h-dvh">
      <div className="min-w-0 flex-1">
        <header className="px-4 pt-5 sm:px-8 sm:pt-6">
          <Link
            href="/painel/agentes"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={15} /> Agentes
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Orb tom={voz?.tone ?? "padrao"} tamanho={44} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-[1.25rem] leading-tight font-semibold tracking-[-0.02em] text-foreground">
                    {agente.nome}
                  </h1>
                  <span
                    className={`rounded-[6px] px-1.5 py-0.5 text-xs font-medium ${statusSelo.c}`}
                  >
                    {statusSelo.t}
                  </span>
                  {alterado && publicada && (
                    <span className="rounded-[6px] bg-[#fdf6d8] px-1.5 py-0.5 text-xs font-medium text-[#7a5b00]">
                      Alterações não publicadas
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {agente.id}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href="#testar" className={`${BOTAO.primario} 2xl:hidden`}>
                <AudioLines size={15} /> Testar agente
              </a>
              {pode(s.papel, "publicar") && publicada && (
                <form
                  action={acaoPausar.bind(
                    null,
                    id,
                    agente.status !== "pausado",
                  )}
                >
                  <button type="submit" className={BOTAO.secundario}>
                    {agente.status === "pausado" ? (
                      <Play size={14} />
                    ) : (
                      <Pause size={14} />
                    )}
                    {agente.status === "pausado" ? "Retomar" : "Pausar"}
                  </button>
                </form>
              )}
              {pode(s.papel, "publicar") && (
                <Link
                  href={`/painel/agentes/${id}?aba=versoes`}
                  className={alterado ? BOTAO.primario : BOTAO.secundario}
                >
                  <Upload size={14} /> Publicar
                </Link>
              )}
            </div>
          </div>
        </header>
        <nav
          aria-label="Seções do agente"
          className="sticky top-12 z-20 mt-4 flex gap-5 overflow-x-auto border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-8 lg:top-0 [&::-webkit-scrollbar]:hidden"
        >
          {ABAS.map(([k, l]) => (
            <Link
              key={k}
              href={`/painel/agentes/${id}?aba=${k}`}
              aria-current={aba === k ? "page" : undefined}
              className={`-mb-px border-b-2 py-3 text-sm whitespace-nowrap transition-colors ${aba === k ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {l}
            </Link>
          ))}
        </nav>
        {aba === "workflow" && (
          <div className="px-4 pt-5 sm:px-6">
            <p className="mb-3 max-w-[720px] text-sm text-muted-foreground">
              Divida o atendimento em etapas. Cada etapa tem um objetivo, e a
              recepcionista segue para a próxima quando a condição do caminho
              acontecer. Desligado, ela atende só com as regras da aba Agente.
            </p>
            <WorkflowEditor
              agenteId={id}
              inicial={cfg.workflow}
              podeEditar={editar}
            />
          </div>
        )}
        <div
          className={`mx-auto w-full max-w-[720px] px-4 py-6 sm:px-8 ${editar ? "" : "pointer-events-none opacity-70"}`}
        >
          {aba === "agente" && (
            <div className="space-y-3">
              <Assistente agenteId={id} />
              <SecaoComportamento config={cfg} acao={acao("comportamento")} />
              <ResumoAgente orgId={s.org.id} agenteId={id} />
            </div>
          )}
          {aba === "testes" && (
            <Link
              href={`/painel/testes?agente=${id}`}
              className="flex items-center justify-between gap-4 rounded-[16px] border border-black/[0.05] bg-surface p-5 transition-colors hover:bg-accent"
            >
              <div>
                <p className="text-[0.9375rem] font-medium text-foreground">
                  Testes da recepcionista
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Clientes simulados ligam para o rascunho. Rode 3×, 5× ou 15× e
                  veja a taxa de aprovação de cada cenário.
                </p>
              </div>
              <ChevronRight
                size={16}
                className="shrink-0 text-muted-foreground"
              />
            </Link>
          )}
          {aba === "conhecimento" && (
            <div className="space-y-3">
              <Conhecimento
                agenteId={id}
                fontes={await db
                  .select()
                  .from(schema.fontesConhecimento)
                  .where(eq(schema.fontesConhecimento.agenteId, id))}
              />
              <SecaoEmpresa config={cfg} acao={acao("empresa")} />
            </div>
          )}
          {aba === "voz" && (
            <SecaoVoz
              config={cfg}
              acao={acao("voz")}
              motoresAtivos={{
                premium: ttsConfigurado(),
                drama: ttsConfigurado("marina"),
                voicestudio: ttsConfigurado("clara"),
              }}
            />
          )}
          {aba === "acoes" && (
            <div className="space-y-3">
              <SecaoAcoes
                config={cfg}
                acao={acao("acoes")}
                googleConectado={
                  (
                    await db
                      .select({ id: schema.integracoes.id })
                      .from(schema.integracoes)
                      .where(
                        and(
                          eq(schema.integracoes.orgId, s.org.id),
                          eq(schema.integracoes.status, "conectado"),
                        ),
                      )
                  ).length > 0
                }
              />
              <Colegas
                agenteId={id}
                atuais={cfg.acoes.colegas ?? []}
                opcoes={(await listarAgentes(s.org.id))
                  .filter((x) => x.id !== id)
                  .map((x) => ({
                    id: x.id,
                    nome: x.rascunho.comportamento.nomeAgente,
                    rotulo: x.nome,
                    publicado: Boolean(x.versaoPublicadaId),
                  }))}
              />
            </div>
          )}
          {aba === "horarios" && (
            <div className="space-y-3">
              <SecaoHorarios config={cfg} acao={acao("horarios")} />
              <details className="rounded-[16px] border border-black/[0.05] bg-surface p-5">
                <summary className="cursor-pointer text-[0.9375rem] font-medium text-foreground">
                  Instruções compiladas do rascunho
                </summary>
                <p className="mt-1 text-sm text-muted-foreground">
                  O que a recepcionista recebe, gerado a partir das suas
                  respostas.
                </p>
                <pre className="mt-3 max-h-[480px] overflow-auto rounded-[10px] bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-body">
                  {(() => {
                    try {
                      return compilarPrompt(cfg);
                    } catch (e) {
                      return `⚠ ${e instanceof Error ? e.message : e}`;
                    }
                  })()}
                </pre>
              </details>
            </div>
          )}
          {aba === "dados" && <SecaoDados config={cfg} acao={acao("dados")} />}
          {aba === "seguranca" && (
            <SecaoSeguranca config={cfg} acao={acao("seguranca")} />
          )}
          {aba === "canais" && (
            <SecaoCanais
              config={cfg}
              acao={acao("widget")}
              agenteId={id}
              origem={origem}
            />
          )}
          {aba === "versoes" && (
            <div className="space-y-10">
              {pode(s.papel, "publicar") && (
                <section>
                  <h2 className="text-[0.9375rem] text-ink">
                    Publicar o rascunho
                  </h2>
                  <p className="mt-1 mb-4 text-sm text-muted-foreground">
                    Os testes críticos rodam no rascunho antes de publicar.
                    Ligações em andamento terminam na versão em que começaram.
                  </p>
                  <PublicarForm agenteId={id} podeForcar={s.papel === "dono"} />
                </section>
              )}
              <section className="rounded-[16px] border border-black/[0.05] bg-surface p-5">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-[0.9375rem] font-medium text-foreground">
                    Experimento A/B
                  </h2>
                  {experimento && (
                    <span className="rounded-[6px] bg-[#e9f7ef] px-1.5 py-0.5 text-xs font-medium text-[#147a3d]">
                      Ao vivo
                    </span>
                  )}
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  Divida as ligações entre a versão no ar e outra versão e
                  compare a taxa de resolução antes de decidir.
                </p>
                {!podeAB ? (
                  <p className="text-sm text-muted-foreground">
                    Disponível no plano Business.{" "}
                    <Link
                      href="/painel/cobranca"
                      className="text-foreground underline underline-offset-2"
                    >
                      Ver planos
                    </Link>
                  </p>
                ) : experimento ? (
                  <ExperimentoAtivo
                    agenteId={id}
                    a={experimento.a}
                    b={experimento.b}
                    percentualB={experimento.experimento.percentualB}
                    desde={experimento.experimento.criadoEm.toLocaleDateString(
                      "pt-BR",
                    )}
                  />
                ) : pode(s.papel, "publicar") ? (
                  <NovoExperimento
                    agenteId={id}
                    versoes={versoes
                      .filter((v) => v.id !== agente.versaoPublicadaId)
                      .map((v) => ({
                        id: v.id,
                        numero: v.numero,
                        nota: v.nota,
                      }))}
                  />
                ) : null}
              </section>
              <section>
                <h2 className="mb-3 text-[0.9375rem] text-ink">Histórico</h2>
                {versoes.length ? (
                  <ul className="divide-y divide-hairline rounded-[16px] border border-border">
                    {versoes.map((v) => {
                      const g = v.resultadoTestes as { resumo?: string } | null;
                      return (
                        <li
                          key={v.id}
                          className="flex flex-wrap items-center gap-3 px-4 py-3"
                        >
                          <span className="font-mono text-sm">v{v.numero}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-ink">
                              {v.nota ?? "Sem nota"}{" "}
                              {v.id === agente.versaoPublicadaId && (
                                <span className="ml-1 rounded-full bg-[#e8f7ee] px-2 py-0.5 text-xs text-[#0f6b34]">
                                  no ar
                                </span>
                              )}
                              {v.forcada && (
                                <span className="ml-1 rounded-full bg-[#fdecec] px-2 py-0.5 text-xs text-error">
                                  publicada com falha
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {v.criadoEm.toLocaleString("pt-BR", {
                                timeZone: "America/Sao_Paulo",
                              })}{" "}
                              {g?.resumo && `· ${g.resumo}`}
                            </p>
                          </div>
                          {v.id !== agente.versaoPublicadaId &&
                            pode(s.papel, "publicar") && (
                              <form action={acaoRestaurar.bind(null, id, v.id)}>
                                <button
                                  type="submit"
                                  className="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm hover:bg-accent"
                                >
                                  Restaurar
                                </button>
                              </form>
                            )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma versão publicada ainda.
                  </p>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
      {/* ≥1536 px: fixed side panel. Smaller (notebooks, phones): drawer opened by "Testar agente". */}
      <aside
        id="testar"
        className="sticky top-0 hidden h-dvh w-[380px] shrink-0 border-l border-border bg-surface target:fixed target:inset-y-0 target:right-0 target:z-50 target:flex target:w-[min(420px,100vw)] target:flex-col target:shadow-[var(--shadow-float)] 2xl:block"
        aria-label="Testar agente"
      >
        <a
          href="#"
          className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-full bg-background text-muted-foreground shadow-[var(--shadow-pill)] hover:text-foreground 2xl:hidden"
          aria-label="Fechar teste"
        >
          ✕
        </a>
        <TestPanel agenteId={id} vozDisponivel />
      </aside>
    </div>
  );
}

async function ResumoAgente({
  orgId,
  agenteId,
}: {
  orgId: string;
  agenteId: string;
}) {
  const c = schema.conversas;
  const [k] = await getDb()
    .select({
      total: sql<number>`count(*)::int`,
      resolvidas: sql<number>`count(*) filter (where ${c.resultado} = 'resolvido')::int`,
      repassadas: sql<number>`count(*) filter (where ${c.resultado} in ('repassado', 'recado'))::int`,
    })
    .from(c)
    .where(
      and(eq(c.orgId, orgId), eq(c.agenteId, agenteId), eq(c.teste, false)),
    );
  return (
    <Link
      href={`/painel/ligacoes`}
      className="grid grid-cols-3 divide-x divide-border rounded-[16px] border border-black/[0.05] bg-surface transition-colors hover:bg-accent"
    >
      {[
        ["Ligações", k.total],
        [
          "Resolvidas sozinha",
          k.total ? `${Math.round((k.resolvidas / k.total) * 100)}%` : "—",
        ],
        ["Passadas à equipe", k.repassadas],
      ].map(([l, v]) => (
        <div key={String(l)} className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">{l}</p>
          <p className="mt-1 text-[1.125rem] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
            {v}
          </p>
        </div>
      ))}
    </Link>
  );
}
