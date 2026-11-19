import Link from "next/link";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { AtualizarEnquanto } from "@/components/painel/atualizar-enquanto";
import { getDb, schema } from "@/db/client";
import { exigirSessao } from "@/server/auth/session";
import { listarAgentes } from "@/server/agent/agentes";
import { garantirCasosPadrao } from "@/server/testes/suite";
import { obterAssinatura } from "@/server/billing/assinaturas";
import { SIMULACOES_POR_PLANO } from "@/lib/billing/ciclo";
import type { PlanId } from "@/lib/pricing/plans";
import { PageHeader, Secao, Vazio } from "@/components/painel/page-header";
import { SuiteTestes, type CasoView } from "@/components/painel/testes";
import { getLlm } from "@/server/providers/llm";

export const metadata = { title: "Testes" };

export default async function TestesPage({ searchParams }: { searchParams: Promise<{ agente?: string }> }) {
  const s = await exigirSessao();
  const sp = await searchParams;
  const agentes = await listarAgentes(s.org.id);
  const agente = agentes.find((a) => a.id === sp.agente) ?? agentes[0];
  if (!agente)
    return (
      <>
        <PageHeader titulo="Testes" />
        <Secao>
          <Vazio titulo="Crie um agente primeiro" texto="A suíte de testes do seu nicho é criada junto com o agente." acao={<Link href="/painel/comecar" className="btn btn-sm btn-primary">Configurar</Link>} />
        </Secao>
      </>
    );
  await garantirCasosPadrao(s.org.id, agente.id);
  const db = getDb();
  const casos = await db.select().from(schema.casosTeste).where(eq(schema.casosTeste.agenteId, agente.id)).orderBy(schema.casosTeste.criadoEm);
  const execs = await db
    .select()
    .from(schema.execucoesTeste)
    .where(eq(schema.execucoesTeste.agenteId, agente.id))
    .orderBy(desc(schema.execucoesTeste.criadoEm))
    .limit(500);
  const a = await obterAssinatura(s.org.id);
  const [{ usadas }] = await db
    .select({ usadas: sql<number>`coalesce(sum(${schema.execucoesTeste.rodadas}), 0)::int` })
    .from(schema.execucoesTeste)
    .where(and(eq(schema.execucoesTeste.orgId, s.org.id), gte(schema.execucoesTeste.criadoEm, a.inicioCiclo)));
  const llm = await getLlm();
  // a suite queued or running in the worker: keep the page refreshing until it finishes
  const [fila] = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.tipo, "testes.suite"), inArray(schema.jobs.status, ["pendente", "rodando"]), sql`${schema.jobs.payload}->>'agenteId' = ${agente.id}`))
    .limit(1);
  const emAndamento = Boolean(fila) || execs.some((e) => e.status === "rodando");

  const view: CasoView[] = casos.map((c) => {
    const e = execs.find((x) => x.casoId === c.id);
    const cfg = c.config as { objetivo?: string; mensagem?: string; criterio?: string; ferramenta?: string };
    return {
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      severidade: c.severidade,
      descricao: c.tipo === "simulacao" ? `${cfg.objetivo} → ${cfg.criterio}` : c.tipo === "chamada_acao" ? `“${cfg.mensagem}” → ${cfg.ferramenta}` : `“${cfg.mensagem}” → ${cfg.criterio}`,
      ultima: e
        ? {
            aprovadas: e.aprovadas,
            rodadas: e.rodadas,
            status: e.status,
            quando: e.criadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }),
            rodadasDetalhe: ((e.detalhes as { rodadas?: CasoView["ultima"] extends infer U ? U extends { rodadasDetalhe: infer R } ? R : never : never })?.rodadas ?? []) as NonNullable<CasoView["ultima"]>["rodadasDetalhe"],
          }
        : null,
    };
  });

  return (
    <>
      <AtualizarEnquanto ativo={emAndamento} />
      <PageHeader
        titulo="Testes"
        descricao="Clientes simulados ligam para o rascunho e cada conversa é avaliada pelos critérios do teste. Cada teste roda várias vezes, porque as respostas variam: o que importa é a taxa de aprovação."
        acoes={
          agentes.length > 1 && (
            <form className="flex gap-2">
              <select name="agente" defaultValue={agente.id} className="field !h-9 !w-56" aria-label="Agente">
                {agentes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-sm btn-secondary">
                Ver
              </button>
            </form>
          )
        }
      />
      <Secao className="space-y-3">
        {!llm.real && (
          <p className="rounded-[12px] bg-[#fdf6d8] px-4 py-3 text-sm text-[#7a5b00]">
            Modo demonstração: sem ANTHROPIC_API_KEY, o cliente simulado segue um roteiro e as conversas não são avaliadas. Configure a chave para testes reais.
          </p>
        )}
        <SuiteTestes agenteId={agente.id} casos={view} cota={{ usadas: Number(usadas), limite: SIMULACOES_POR_PLANO[a.planoId as PlanId] }} />
      </Secao>
    </>
  );
}
