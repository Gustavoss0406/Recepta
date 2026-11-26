import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Check } from "lucide-react";
import { getDb, schema } from "@/db/client";
import { exigirSessao } from "@/server/auth/session";
import { primeiroAgente } from "@/server/agent/agentes";
import { onboardingAvancar, onboardingSecao } from "../actions";
import { FormEmpresa, FormSite } from "@/components/painel/onboarding-forms";
import { SecaoComportamento, SecaoEmpresa, SecaoVoz } from "@/components/painel/secoes";
import { TestPanel } from "@/components/painel/test-panel";
import { Desvio } from "@/components/painel/desvio";
import { PublicarForm } from "@/components/painel/publicar";
import { Assistente } from "@/components/painel/assistente";
import { OnboardingConversa } from "@/components/onboarding/conversa";
import { CONECTORES } from "@/lib/integracoes/catalogo";
import { googleConfigurado } from "@/server/integracoes/google";
import { oauthConfigurado } from "@/server/integracoes/oauth";
import { MeLigue } from "@/components/painel/me-ligue";
import { LIGACOES_POR_DIA, ligacoesHoje } from "@/server/telefonia/me-ligue";
import { or } from "drizzle-orm";
import { iniciar, responder } from "@/lib/onboarding/conversa";
import { salvarOnboarding } from "@/server/onboarding/conversa";

export const metadata = { title: "Começar" };

const PASSOS = ["Sua empresa", "Seu site", "Como a recepcionista trabalha", "Voz e saudação", "Teste agora", "Seu número", "Publicar"];

export default async function ComecarPage({ searchParams }: { searchParams: Promise<{ passo?: string; lido?: string; modo?: string; conversa?: string; negocio?: string }> }) {
  const s = await exigirSessao();
  const sp = await searchParams;
  const db = getDb();
  const [org] = await db.select().from(schema.organizacoes).where(eq(schema.organizacoes.id, s.org.id));
  const agente = await primeiroAgente(s.org.id);
  // first access: the onboarding is a conversation with the Recepta while the flow builds itself
  if ((!agente && sp.modo !== "formulario") || sp.conversa || sp.negocio) {
    let estado = sp.conversa && org.onboardingConversa?.concluido ? iniciar() : (org.onboardingConversa ?? iniciar());
    // coming from a template card ("Pet shop", "Imobiliária"…): the first answer is already given
    if (sp.negocio && (estado.mensagens.length <= 1 || estado.concluido)) {
      estado = responder(iniciar(), sp.negocio.slice(0, 80));
      await salvarOnboarding(s.org.id, estado);
    }
    const conectadas = (await db.select({ tipo: schema.integracoes.tipo, status: schema.integracoes.status }).from(schema.integracoes).where(eq(schema.integracoes.orgId, s.org.id)))
      .filter((l) => l.status === "conectado")
      .map((l) => (l.tipo === "google_agenda" ? "google" : l.tipo));
    const oauthDisponiveis = CONECTORES.filter((c) => (c.id === "google" ? googleConfigurado() : c.oauthEnv && oauthConfigurado(c.id))).map((c) => c.id);
    return <OnboardingConversa inicial={estado} agenteInicial={agente?.id ?? null} conectadasIniciais={conectadas} oauthDisponiveis={oauthDisponiveis} />;
  }
  const maximo = agente ? Math.max(org.onboardingPasso, 2) : 1;
  const passo = Math.min(Math.max(1, Number(sp.passo ?? org.onboardingPasso) || 1), maximo, 7);

  const fontes = agente
    ? await db.select().from(schema.fontesConhecimento).where(eq(schema.fontesConhecimento.agenteId, agente.id))
    : [];
  const [numero] = await db
    .select()
    .from(schema.numeros)
    .where(and(eq(schema.numeros.orgId, s.org.id), eq(schema.numeros.tipo, "desvio")))
    .limit(1);
  const testou = agente
    ? (await db
        .select({ id: schema.conversas.id })
        .from(schema.conversas)
        .where(and(eq(schema.conversas.agenteId, agente.id), or(eq(schema.conversas.teste, true), eq(schema.conversas.canal, "me_ligue"))))
        .limit(1)).length > 0
    : false;

  return (
    <div className="grid min-h-dvh grid-cols-1 content-start lg:grid-cols-[260px_1fr] lg:content-stretch">
      <nav aria-label="Etapas" className="min-w-0 border-b border-hairline px-4 py-6 sm:px-8 lg:border-r lg:border-b-0">
        <p className="text-sm text-muted-foreground">Configuração</p>
        <h1 className="mt-1 text-[1.375rem] font-medium tracking-[-0.025em]">Seu agente em 7 passos</h1>
        <ol className="mt-6 flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
          {PASSOS.map((p, i) => {
            const n = i + 1;
            const feito = n < org.onboardingPasso || org.onboardingConcluido;
            const atual = n === passo;
            const liberado = n <= maximo;
            const conteudo = (
              <>
                <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${atual ? "bg-ink text-white" : feito ? "bg-success text-white" : "bg-strong text-muted-foreground"}`}>
                  {feito && !atual ? <Check size={12} /> : n}
                </span>
                <span className="whitespace-nowrap">{p}</span>
              </>
            );
            return (
              <li key={p}>
                {liberado ? (
                  <Link href={`/painel/comecar?passo=${n}`} aria-current={atual ? "step" : undefined} className={`flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-sm ${atual ? "bg-white text-ink shadow-[var(--shadow-pill)]" : "text-body"}`}>
                    {conteudo}
                  </Link>
                ) : (
                  <span className="flex items-center gap-2.5 px-2 py-1.5 text-sm text-muted-soft">{conteudo}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <main className="min-w-0 px-4 py-8 sm:px-10">
        <p className="font-mono text-xs text-muted-foreground">
          Passo {passo} de 7
        </p>
        {passo === 1 && (
          <Etapa titulo="Conte sobre sua empresa" texto="Isso define o modelo do agente, os testes e as perguntas que ele faz.">
            <FormEmpresa org={org} />
          </Etapa>
        )}
        {passo === 2 && agente && (
          <Etapa titulo="O que a recepcionista precisa saber" texto="Lemos o seu site e montamos a base de conhecimento. Revise o que aprendemos.">
            {fontes.length === 0 || !sp.lido ? (
              <FormSite />
            ) : (
              <div className="space-y-6">
                <div className="rounded-[12px] bg-white p-4 shadow-[var(--shadow-pill)]">
                  <p className="text-sm text-ink">O que aprendemos</p>
                  <ul className="mt-2 space-y-1 text-sm text-body">
                    {fontes.map((f) => (
                      <li key={f.id}>
                        {f.status === "pronto" ? "✓" : f.status === "erro" ? "✗" : "…"} {f.titulo} {f.paginas > 1 && <span className="text-muted-foreground">· {f.paginas} páginas</span>}
                        {f.erro && <span className="text-error"> — {f.erro}</span>}
                      </li>
                    ))}
                  </ul>
                  <Link href="/painel/comecar?passo=2" className="mt-3 inline-block text-xs text-muted-foreground underline">
                    Ler outro site
                  </Link>
                </div>
                <SecaoEmpresa config={agente.rascunho} acao={onboardingSecao.bind(null, "empresa", 3)} rotulo="Confirmar e continuar" />
              </div>
            )}
          </Etapa>
        )}
        {passo === 3 && agente && (
          <Etapa titulo="Como a recepcionista trabalha" texto="Conte sobre o seu negócio em poucas frases, ou ajuste as regras abaixo. Você pode mudar tudo depois.">
            <Assistente agenteId={agente.id} modo="criar" className="mb-6" />
            <SecaoComportamento config={agente.rascunho} acao={onboardingSecao.bind(null, "comportamento", 4)} rotulo="Salvar e continuar" />
          </Etapa>
        )}
        {passo === 4 && agente && (
          <Etapa titulo="Voz e saudação" texto="Escolha quem atende. As vozes são exclusivas do catálogo Recepta.">
            <SecaoVoz config={agente.rascunho} acao={onboardingSecao.bind(null, "voz", 5)} rotulo="Salvar e continuar" />
          </Etapa>
        )}
        {passo === 5 && agente && (
          <Etapa titulo="Teste agora" texto="Converse como se fosse um cliente. Você precisa ouvir pelo menos uma resposta antes de seguir.">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
              <div className="h-[560px] overflow-hidden rounded-[16px] bg-strong">
                <TestPanel agenteId={agente.id} />
              </div>
              <div className="space-y-3 text-sm text-body">
                <MeLigue agenteId={agente.id} telefone={org.telefoneContato} restantes={Math.max(0, LIGACOES_POR_DIA - (await ligacoesHoje(s.org.id)))} className="mb-4 max-w-md" />
                <p className="text-ink">Ideias para testar:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Peça para agendar um horário</li>
                  <li>Pergunte o endereço ou um preço</li>
                  <li>Peça para falar com uma pessoa</li>
                </ul>
                <form action={onboardingAvancar.bind(null, 6)}>
                  <button type="submit" disabled={!testou} className="btn btn-primary mt-4 disabled:opacity-40">
                    {testou ? "Continuar" : "Teste antes de continuar"}
                  </button>
                </form>
                {!testou && <p className="text-xs text-muted-foreground">Depois do primeiro teste, recarregue a página para liberar.</p>}
              </div>
            </div>
          </Etapa>
        )}
        {passo === 6 && (
          <Etapa titulo="Seu número" texto="Desvie as ligações do número que seus clientes já conhecem. Ninguém precisa trocar de número.">
            <Desvio numero={numero ?? null} />
            <form action={onboardingAvancar.bind(null, 7)} className="mt-8">
              <button type="submit" className="btn btn-primary">
                {numero?.verificadoEm ? "Continuar" : "Fazer isso depois"}
              </button>
            </form>
          </Etapa>
        )}
        {passo === 7 && agente && (
          <Etapa titulo="Colocar no ar" texto="Antes de publicar, rodamos os testes críticos do seu nicho no rascunho.">
            <ul className="mb-6 max-w-xl space-y-2 text-sm">
              {[
                ["Conhecimento", fontes.some((f) => f.status === "pronto")],
                ["Voz e saudação com aviso de atendimento virtual", true],
                ["Teste realizado", testou],
                ["Desvio verificado", Boolean(numero?.verificadoEm)],
              ].map(([l, ok]) => (
                <li key={String(l)} className="flex items-center gap-2">
                  <span className={`grid size-5 place-items-center rounded-full text-[0.65rem] ${ok ? "bg-success text-white" : "bg-strong text-muted-foreground"}`}>{ok ? "✓" : "–"}</span>
                  <span className={ok ? "text-ink" : "text-muted-foreground"}>{String(l)}</span>
                </li>
              ))}
            </ul>
            <PublicarForm agenteId={agente.id} onboarding podeForcar={s.papel === "dono"} />
          </Etapa>
        )}
      </main>
    </div>
  );
}

function Etapa({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <section className="mt-2">
      <h2 className="text-[1.75rem] leading-tight font-medium tracking-[-0.03em]">{titulo}</h2>
      <p className="mt-2 max-w-xl text-[0.9375rem] text-muted-foreground">{texto}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}
