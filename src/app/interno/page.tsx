import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirStaff } from "@/server/auth/session";
import { getPlan, type PlanId } from "@/lib/pricing/plans";
import { PRICING_COGS_BRL_PER_MIN } from "@/lib/pricing/cogs";
import { TAX_AND_FEES_RATE } from "@/lib/pricing/rates";
import { formatBRL, formatPct } from "@/lib/format";
import { Logo } from "@/components/ui/logo";

export const metadata = { title: "Interno · margem" };

/** Recepta staff only: real margin per customer from the cost ledger. */
export default async function InternoPage() {
  await exigirStaff();
  const db = getDb();
  const desde = new Date(Date.now() - 30 * 86_400_000);
  const orgs = await db
    .select({ org: schema.organizacoes, a: schema.assinaturas })
    .from(schema.organizacoes)
    .innerJoin(schema.assinaturas, eq(schema.assinaturas.orgId, schema.organizacoes.id));
  const custos = await db
    .select({
      orgId: schema.registroCusto.orgId,
      tipo: schema.registroCusto.tipo,
      brl: sql<number>`sum(${schema.registroCusto.custoBrl})`,
      telefonia: sql<number>`sum((${schema.registroCusto.detalhes}->>'telefonia')::float)`,
      stt: sql<number>`sum((${schema.registroCusto.detalhes}->>'stt')::float)`,
      tts: sql<number>`sum((${schema.registroCusto.detalhes}->>'tts')::float)`,
      llm: sql<number>`sum((${schema.registroCusto.detalhes}->>'llm')::float)`,
    })
    .from(schema.registroCusto)
    .where(gte(schema.registroCusto.criadoEm, desde))
    .groupBy(schema.registroCusto.orgId, schema.registroCusto.tipo);
  const receitas = await db
    .select({ orgId: schema.faturas.orgId, c: sql<number>`sum(${schema.faturas.totalCentavos})::int` })
    .from(schema.faturas)
    .where(and(gte(schema.faturas.criadoEm, desde), sql`${schema.faturas.status} in ('paga','aberta','vencida')`))
    .groupBy(schema.faturas.orgId);
  const minutos = await db
    .select({ orgId: schema.conversas.orgId, m: sql<number>`sum(${schema.conversas.minutosCobrados})::int` })
    .from(schema.conversas)
    .where(and(gte(schema.conversas.iniciadaEm, desde), eq(schema.conversas.teste, false)))
    .groupBy(schema.conversas.orgId);

  const linhas = orgs.map(({ org, a }) => {
    const c = custos.filter((x) => x.orgId === org.id);
    const custo = c.reduce((s, x) => s + Number(x.brl ?? 0), 0);
    const custoTestes = c.filter((x) => x.tipo !== "chamada").reduce((s, x) => s + Number(x.brl ?? 0), 0);
    const plano = getPlan(a.planoId as PlanId);
    const receita = (receitas.find((r) => r.orgId === org.id)?.c ?? 0) / 100;
    const fixo = plano.fixedCostBrl;
    const impostos = receita * TAX_AND_FEES_RATE;
    const lucro = receita - custo - fixo - impostos;
    const min = minutos.find((m) => m.orgId === org.id)?.m ?? 0;
    return { org, a, plano, receita, custo, custoTestes, fixo, impostos, lucro, margem: receita > 0 ? lucro / receita : null, min, custoMin: min ? (custo - custoTestes) / min : null };
  });
  const tot = linhas.reduce((s, l) => ({ receita: s.receita + l.receita, custo: s.custo + l.custo, lucro: s.lucro + l.lucro }), { receita: 0, custo: 0, lucro: 0 });
  const comp = custos.reduce(
    (s, x) => ({ telefonia: s.telefonia + Number(x.telefonia ?? 0), stt: s.stt + Number(x.stt ?? 0), tts: s.tts + Number(x.tts ?? 0), llm: s.llm + Number(x.llm ?? 0) }),
    { telefonia: 0, stt: 0, tts: 0, llm: 0 },
  );

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-white">interno</span>
        </div>
        <Link href="/painel" className="text-sm text-muted-foreground">
          Voltar ao painel
        </Link>
      </header>
      <main className="space-y-6 px-6 py-8">
        <h1 className="text-[1.625rem] font-medium tracking-[-0.025em]">Margem por cliente · últimos 30 dias</h1>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="panel p-4">
            <p className="text-sm text-muted-foreground">Receita faturada</p>
            <p className="mt-2 text-[1.5rem] font-medium">{formatBRL(tot.receita)}</p>
          </div>
          <div className="panel p-4">
            <p className="text-sm text-muted-foreground">Custo real (registro)</p>
            <p className="mt-2 text-[1.5rem] font-medium">{formatBRL(tot.custo)}</p>
          </div>
          <div className="panel p-4">
            <p className="text-sm text-muted-foreground">Lucro bruto</p>
            <p className="mt-2 text-[1.5rem] font-medium">{formatBRL(tot.lucro)}</p>
          </div>
          <div className="panel p-4">
            <p className="text-sm text-muted-foreground">Custo por componente (USD)</p>
            <p className="mt-2 text-xs text-body">
              LLM {comp.llm.toFixed(3)} · TTS {comp.tts.toFixed(3)} · STT {comp.stt.toFixed(3)} · Tel. {comp.telefonia.toFixed(3)}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-[16px] bg-white shadow-[var(--shadow-pill)]">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-muted-foreground">
                {["Cliente", "Plano", "Status", "Receita", "Custo", "dos quais testes", "Impostos", "Lucro", "Margem", "Custo/min real"].map((h) => (
                  <th key={h} className="px-4 py-3 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {linhas.map((l) => (
                <tr key={l.org.id} className={l.margem != null && l.margem < 0.25 ? "bg-[#fdecec]/50" : ""}>
                  <td className="px-4 py-3 text-ink">{l.org.nome}</td>
                  <td className="px-4 py-3">{l.plano.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.a.status}</td>
                  <td className="px-4 py-3 font-mono">{formatBRL(l.receita)}</td>
                  <td className="px-4 py-3 font-mono">{formatBRL(l.custo)}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{formatBRL(l.custoTestes)}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{formatBRL(l.impostos)}</td>
                  <td className="px-4 py-3 font-mono">{formatBRL(l.lucro)}</td>
                  <td className={`px-4 py-3 ${l.margem != null && l.margem < 0.25 ? "text-error" : ""}`}>{l.margem == null ? "—" : formatPct(l.margem)}</td>
                  <td className={`px-4 py-3 font-mono ${l.custoMin != null && l.custoMin > PRICING_COGS_BRL_PER_MIN ? "text-error" : ""}`}>{l.custoMin == null ? "—" : formatBRL(l.custoMin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Linhas em vermelho: margem abaixo de 25% ou custo por minuto acima do COGS de precificação ({formatBRL(PRICING_COGS_BRL_PER_MIN)}). Câmbio, impostos (16%) e
          custos fixos conforme a tabela de custos (src/lib/pricing/rates.ts).
        </p>
      </main>
    </div>
  );
}
