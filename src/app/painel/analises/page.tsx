import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";
import { Kpi, PageHeader, Secao, Segmentado, Vazio } from "@/components/painel/page-header";
import { BarChart } from "@/components/charts/bar-chart";
import { formatBRLRound, formatInt, formatPct } from "@/lib/format";

export const metadata = { title: "Análises" };

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default async function AnalisesPage({ searchParams }: { searchParams: Promise<{ periodo?: string; valor?: string }> }) {
  const s = await exigirPermissao("verLigacoes");
  const sp = await searchParams;
  const dias = Number(sp.periodo ?? 30);
  const valorAgendamento = Number(sp.valor ?? 150);
  const desde = new Date(Date.now() - dias * 86_400_000);
  const c = schema.conversas;
  const db = getDb();
  const base = and(eq(c.orgId, s.org.id), eq(c.teste, false), gte(c.iniciadaEm, desde));
  const local = sql`(${c.iniciadaEm} at time zone 'America/Sao_Paulo')`;

  const [k] = await db
    .select({
      total: sql<number>`count(*)::int`,
      resolvidas: sql<number>`count(*) filter (where ${c.resultado} = 'resolvido')::int`,
      transferidas: sql<number>`count(*) filter (where ${c.resultado} = 'transferido')::int`,
      repassadas: sql<number>`count(*) filter (where ${c.resultado} in ('repassado', 'recado'))::int`,
      foraHorario: sql<number>`count(*) filter (where ${c.modoRecado} = true or extract(hour from ${local}) not between 8 and 17 or extract(dow from ${local}) = 0)::int`,
      duracaoMedia: sql<number>`coalesce(avg(${c.duracaoS}), 0)::int`,
      minutos: sql<number>`coalesce(sum(${c.minutosCobrados}), 0)::int`,
    })
    .from(c)
    .where(base);
  const [ag] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.agendaEventos)
    .where(and(eq(schema.agendaEventos.orgId, s.org.id), eq(schema.agendaEventos.simulado, false), gte(schema.agendaEventos.criadoEm, desde)));
  const porHora = await db
    .select({ h: sql<number>`extract(hour from ${local})::int`, n: sql<number>`count(*)::int` })
    .from(c)
    .where(base)
    .groupBy(sql`1`);
  const porDia = await db
    .select({ d: sql<number>`extract(dow from ${local})::int`, n: sql<number>`count(*)::int` })
    .from(c)
    .where(base)
    .groupBy(sql`1`);
  const porVersao = await db
    .select({
      numero: schema.agenteVersoes.numero,
      agente: schema.agentes.nome,
      total: sql<number>`count(*)::int`,
      resolvidas: sql<number>`count(*) filter (where ${c.resultado} = 'resolvido')::int`,
      sucesso: sql<number>`count(*) filter (where (${c.avaliacao}->>'sucesso')::boolean)::int`,
    })
    .from(c)
    .innerJoin(schema.agenteVersoes, eq(schema.agenteVersoes.id, c.versaoId))
    .innerJoin(schema.agentes, eq(schema.agentes.id, c.agenteId))
    .where(base)
    .groupBy(schema.agenteVersoes.numero, schema.agentes.nome)
    .orderBy(schema.agentes.nome, schema.agenteVersoes.numero);
  const motivos = await db
    .select({ motivo: c.motivo, n: sql<number>`count(*)::int` })
    .from(c)
    .where(and(base, sql`${c.motivo} is not null`))
    .groupBy(c.motivo)
    .orderBy(sql`2 desc`)
    .limit(8);

  const horas = Array.from({ length: 24 }, (_, h) => porHora.find((x) => Number(x.h) === h)?.n ?? 0);
  const semana = Array.from({ length: 7 }, (_, d) => porDia.find((x) => Number(x.d) === d)?.n ?? 0);

  return (
    <>
      <PageHeader
        titulo="Análises"
        descricao="O que a recepcionista fez pela sua empresa."
        acoes={
          <>
            <Segmentado
              rotulo="Período"
              valor={String(dias) as "7" | "30" | "90"}
              opcoes={[
                { v: "7", t: "7 dias" },
                { v: "30", t: "30 dias" },
                { v: "90", t: "90 dias" },
              ]}
              href={(v) => `/painel/analises?periodo=${v}&valor=${valorAgendamento}`}
            />
            <form className="flex items-center gap-1.5">
              <input type="hidden" name="periodo" value={dias} />
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                R$ por agendamento
                <input name="valor" type="number" min={0} defaultValue={valorAgendamento} className="field !h-8 !w-20 !rounded-full" />
              </label>
              <button type="submit" className="h-8 rounded-full border border-border px-3 text-sm hover:bg-accent">
                Aplicar
              </button>
            </form>
          </>
        }
      />
      {k.total === 0 ? (
        <Secao>
          <Vazio titulo="Sem ligações no período" texto="As análises aparecem quando a recepcionista começar a atender ligações reais." />
        </Secao>
      ) : (
        <>
          <Secao>
            <div className="panel mb-3 p-5">
              <p className="text-sm text-muted-foreground">Retorno no período</p>
              <p className="mt-2 text-[1.0625rem] text-foreground">
                A recepcionista atendeu <strong className="font-medium">{formatInt(k.total)}</strong> ligações, <strong className="font-medium">{formatInt(k.foraHorario)}</strong> fora do horário comercial, e gerou{" "}
                <strong className="font-medium">{formatInt(ag.n)}</strong> agendamentos ≈ <strong className="font-medium">{formatBRLRound(ag.n * valorAgendamento)}</strong> em receita potencial.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi rotulo="Resolvidas sozinha" valor={formatPct(k.resolvidas / k.total)} detalhe={`${k.resolvidas} de ${k.total}`} />
              <Kpi rotulo="Transferidas" valor={formatInt(k.transferidas)} />
              <Kpi rotulo="Passadas à equipe" valor={formatInt(k.repassadas)} detalhe="viraram pendências com relatório" />
              <Kpi rotulo="Duração média" valor={`${Math.floor(k.duracaoMedia / 60)}:${String(k.duracaoMedia % 60).padStart(2, "0")}`} detalhe={`${formatInt(k.minutos)} minutos no total`} />
            </div>
          </Secao>
          <Secao className="grid gap-3 xl:grid-cols-2">
            <BarChart titulo="Ligações por hora do dia" rotulos={horas.map((_, h) => `${h}h`)} valores={horas} />
            <BarChart titulo="Ligações por dia da semana" rotulos={DIAS} valores={semana} />
          </Secao>
          <Secao className="grid gap-6 xl:grid-cols-2">
            <section>
              <h2 className="mb-3 text-[0.9375rem] font-semibold text-foreground">Resultado por versão</h2>
              <div className="overflow-hidden rounded-[16px] border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-normal">Versão</th>
                    <th className="px-4 py-2.5 font-normal">Ligações</th>
                    <th className="px-4 py-2.5 font-normal">Resolução</th>
                    <th className="px-4 py-2.5 font-normal">Sucesso (avaliação)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {porVersao.map((v) => (
                    <tr key={`${v.agente}-${v.numero}`}>
                      <td className="px-4 py-2.5 tabular-nums">
                        {v.agente} <span className="font-mono text-xs text-muted-foreground">v{v.numero}</span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{v.total}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatPct(v.resolvidas / v.total)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatPct(v.sucesso / v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </section>
            <section>
              <h2 className="mb-3 text-[0.9375rem] font-semibold text-foreground">Principais motivos de contato</h2>
              <ul className="space-y-2.5 rounded-[16px] border border-border p-4">
                {motivos.map((m) => (
                  <li key={m.motivo} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-foreground">{m.motivo}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{m.n}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${(m.n / motivos[0].n) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </Secao>
        </>
      )}
    </>
  );
}
