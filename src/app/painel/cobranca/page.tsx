import { FundoFotos } from "@/components/painel/capa";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirPermissao, pode } from "@/server/auth/session";
import { resumoCobranca } from "@/server/billing/assinaturas";
import { getPagamentos } from "@/server/providers/pagamentos";
import { PLANS } from "@/lib/pricing/plans";
import { MINUTOS_TESTE_GRATIS, previsaoMinutos } from "@/lib/billing/ciclo";
import { formatBRL, formatInt } from "@/lib/format";
import { Kpi, PageHeader, Secao } from "@/components/painel/page-header";
import { EscolherPlano, Limites } from "@/components/painel/cobranca-forms";

export const metadata = { title: "Uso e cobrança" };

const STATUS: Record<string, string> = { aberta: "Em aberto", paga: "Paga", vencida: "Vencida", cancelada: "Cancelada" };

export default async function CobrancaPage({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const s = await exigirPermissao("verCobranca");
  const sp = await searchParams;
  const r = await resumoCobranca(s.org.id);
  const faturas = await getDb().select().from(schema.faturas).where(eq(schema.faturas.orgId, s.org.id)).orderBy(desc(schema.faturas.criadoEm)).limit(24);
  const a = r.assinatura;
  const pct = Math.min(100, (r.usadosFranquia / Math.max(1, r.incluidos)) * 100);
  const previsto = previsaoMinutos(r.usadosFranquia, a.inicioCiclo, a.fimCiclo, new Date());
  const trial = a.status === "trial";
  const gerenciar = pode(s.papel, "gerenciarCobranca");
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <PageHeader fundo={<FundoFotos slugs={["equipe", "advocacia", "recepcao"]} />}
        titulo="Uso e cobrança"
        descricao={trial ? `Teste grátis até ${fmt(a.fimCiclo)}` : `Plano ${r.plano.name} (${a.ciclo}) · ciclo de ${fmt(a.inicioCiclo)} a ${fmt(a.fimCiclo)}`}
      />
      {sp.pago && <p className="mx-4 mt-6 rounded-[12px] bg-[#e8f7ee] px-4 py-3 text-sm text-[#0f6b34] sm:mx-8">Pagamento confirmado. Obrigado!</p>}
      {(a.status === "inadimplente" || a.status === "suspensa") && (
        <p className="mx-4 mt-6 rounded-[12px] bg-[#fdecec] px-4 py-3 text-sm text-[#a4161a] sm:mx-8">
          {a.status === "suspensa" ? "Conta suspensa por falta de pagamento: a recepcionista não está atendendo." : "Há uma fatura vencida. Pague para evitar a suspensão."}
        </p>
      )}
      <Secao>
        <div className="panel p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Minutos do ciclo</p>
              <p className="mt-1 text-[2rem] leading-none font-medium tracking-[-0.03em]">
                {formatInt(r.usadosFranquia)} <span className="text-base text-muted-foreground">/ {formatInt(r.incluidos)}</span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground">Previsão até o fim do ciclo: {formatInt(previsto)} min</p>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Uso da franquia">
            <div className={`h-full rounded-full ${pct >= 100 ? "bg-error" : pct >= 80 ? "bg-[#e5a000]" : "bg-ink"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Alertas em 80% e 100%. Testes por voz no painel: {formatInt(r.uso.minutosTeste)} de {MINUTOS_TESTE_GRATIS} min grátis usados.
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi rotulo="Ligações (min)" valor={formatInt(r.uso.minutos)} />
          <Kpi rotulo="Em pico (min)" valor={formatInt(r.uso.minutosPico)} detalhe="cobrados em dobro" />
          <Kpi rotulo="Parcial do ciclo" valor={formatBRL(r.parcialCentavos / 100)} detalhe="plano + excedente até agora" />
          <Kpi rotulo="Situação" valor={r.estado === "teto" ? "Teto atingido" : r.estado === "esgotada" ? (trial ? "Esgotada" : "Excedente") : "Normal"} />
        </div>
      </Secao>

      <Secao>
        <h2 className="mb-4 text-[0.9375rem] text-ink">{trial ? "Escolha seu plano" : "Trocar de plano"}</h2>
        <EscolherPlano
          planos={PLANS.filter((p) => ["start", "pro", "business"].includes(p.id)).map((p) => ({
            id: p.id,
            name: p.name,
            priceBrl: p.priceBrl!,
            includedMinutes: p.includedMinutes,
            overageBrl: p.overageBrl!,
            concurrency: p.concurrency!,
            featured: p.featured,
          }))}
          atual={trial ? "" : a.planoId}
          podeGerenciar={gerenciar}
        />
      </Secao>

      {!trial && (
        <Secao>
          <h2 className="mb-4 text-[0.9375rem] text-ink">Limites</h2>
          <Limites teto={a.tetoBrl} pico={a.picoHabilitado} podeGerenciar={gerenciar} />
        </Secao>
      )}

      <Secao>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[0.9375rem] text-ink">Faturas</h2>
          {!getPagamentos().real && <span className="text-xs text-muted-foreground">Gateway em modo simulado (sem ASAAS_API_KEY)</span>}
        </div>
        {faturas.length ? (
          <ul className="divide-y divide-hairline rounded-[16px] bg-white shadow-[var(--shadow-pill)]">
            {faturas.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{f.itens.map((i) => (i.quantidade > 1 ? `${i.descricao} (${i.quantidade})` : i.descricao)).join(" · ")}</p>
                  <p className="text-xs text-muted-foreground">Vence em {fmt(f.vencimento)}</p>
                </div>
                <span className="font-mono text-sm">{formatBRL(f.totalCentavos / 100)}</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs ${f.status === "paga" ? "bg-[#e8f7ee] text-[#0f6b34]" : f.status === "vencida" ? "bg-[#fdecec] text-[#a4161a]" : "bg-strong text-body"}`}
                >
                  {STATUS[f.status]}
                </span>
                {(f.status === "aberta" || f.status === "vencida") && f.linkPagamento && (
                  <Link href={f.linkPagamento} className="btn btn-sm btn-primary !h-8 text-xs" target={f.linkPagamento.startsWith("http") ? "_blank" : undefined}>
                    Pagar
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma fatura ainda.</p>
        )}
      </Secao>
    </>
  );
}
