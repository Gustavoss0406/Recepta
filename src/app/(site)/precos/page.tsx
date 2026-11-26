import { FundoFotos } from "@/components/painel/capa";
import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { ADDONS, PLANS } from "@/lib/pricing/plans";
import { PriceCalculator } from "@/components/site/price-calculator";
import { Faq } from "@/components/site/faq";
import { formatBRL, formatBRLRound, formatInt } from "@/lib/format";

export const metadata: Metadata = {
  title: "Preços",
  description: "Planos com número, minutos, voz e inteligência artificial inclusos. Preço fixo em reais.",
};

const FAQ = [
  {
    q: "O que acontece se eu passar da franquia de minutos?",
    a: "As ligações continuam sendo atendidas e cada minuto extra é cobrado pelo valor do seu plano. Você recebe avisos em 80% e 100% da franquia e pode definir um teto mensal.",
  },
  {
    q: "Como é contado o minuto?",
    a: "Cada ligação é arredondada para o minuto iniciado. Uma ligação de 2 minutos e 5 segundos conta 3 minutos.",
  },
  {
    q: "E se muitas pessoas ligarem ao mesmo tempo?",
    a: "Cada plano tem um número de chamadas simultâneas. Acima do limite, as ligações entram em fila com áudio de espera, ou você ativa o modo pico, em que o minuto excedente custa o dobro.",
  },
  {
    q: "Quais formas de pagamento vocês aceitam?",
    a: "Pix, boleto e cartão de crédito. No plano anual você ganha 2 meses grátis.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim, sem multa. O plano fica ativo até o fim do ciclo pago.",
  },
  {
    q: "A telefonia é cobrada à parte?",
    a: "Não. O número local e os minutos de telefonia já estão no preço do plano.",
  },
];

const ROWS: { label: string; get: (p: (typeof PLANS)[number]) => string }[] = [
  { label: "Minutos inclusos", get: (p) => (p.id === "enterprise" ? "10 mil ou mais" : `${formatInt(p.includedMinutes)} min`) },
  { label: "Minuto extra", get: (p) => (p.overageBrl ? formatBRL(p.overageBrl) : "—") },
  { label: "Minuto em pico (acima do limite)", get: (p) => (p.overageBrl ? formatBRL(p.overageBrl * 2) : "—") },
  { label: "Chamadas simultâneas", get: (p) => (p.concurrency ? String(p.concurrency) : "Personalizado") },
  { label: "Agentes", get: (p) => (p.agents ? String(p.agents) : "Ilimitados") },
  { label: "Números inclusos", get: (p) => String(p.numbers) },
  { label: "Usuários", get: (p) => (p.seats ? String(p.seats) : "Ilimitados") },
];

export default async function PrecosPage() {
  const cards = PLANS;
  const tablePlans = PLANS.filter((p) => p.id !== "teste");

  return (
    <div className="grid-frame">
      <section className="container-page relative isolate pt-16 pb-12 sm:pt-24">
        <FundoFotos slugs={["clinica", "restaurante", "salao"]} />
        <h1 className="display-hero max-w-2xl">Preço fixo em reais, com tudo incluso</h1>
        <p className="mt-6 lead max-w-xl text-body">
          Número, minutos, voz, transcrição e inteligência artificial num só valor. Sem dólar, sem IOF e sem conta de
          telefonia separada.
        </p>
      </section>

      <section className="container-page pb-24">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map((p) => (
            <article
              key={p.id}
              className={`flex flex-col rounded-[16px] p-5 ${p.featured ? "bg-dark text-white" : "panel"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[0.9375rem]">{p.name}</h2>
                {p.featured && <span className="badge !bg-white/10 !text-white !shadow-none">Popular</span>}
              </div>
              <p className="mt-5 min-h-[3rem]">
                {p.priceBrl == null ? (
                  <span className="display-sm">Sob consulta</span>
                ) : (
                  <>
                    <span className="display-section whitespace-nowrap lg:!text-[1.75rem]">{formatBRLRound(p.priceBrl)}</span>
                    <span className={p.featured ? "text-white/60" : "text-muted-foreground"}> /mês</span>
                  </>
                )}
              </p>
              <p className={`mt-2 text-sm ${p.featured ? "text-white/70" : "text-muted-foreground"}`}>{p.blurb}</p>
              <Link
                href={p.id === "enterprise" ? "mailto:vendas@recepta.ai" : "/criar-conta"}
                className={`btn btn-sm mt-6 ${p.featured ? "btn-on-dark" : p.id === "teste" ? "btn-secondary" : "btn-primary"}`}
              >
                {p.id === "teste" ? "Testar grátis" : p.id === "enterprise" ? "Falar com vendas" : `Escolher ${p.name}`}
              </Link>
              <ul className="mt-6 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className={`flex gap-2 text-sm ${p.featured ? "text-white/85" : "text-body"}`}>
                    <Check size={15} className="mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Valores com impostos inclusos. Plano anual com 2 meses grátis.</p>
      </section>

      <section className="rule-t">
        <div className="container-page py-24">
          <h2 className="display-section max-w-xl">Calcule o seu plano</h2>
          <div className="mt-10">
            <PriceCalculator />
          </div>
        </div>
      </section>

      <section className="rule-t">
        <div className="container-page py-24">
          <h2 className="display-section">Compare os planos</h2>
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="py-3 font-normal text-muted-foreground">Inclui</th>
                  {tablePlans.map((p) => (
                    <th key={p.id} className="py-3 font-medium text-ink">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.label} className="border-b border-hairline">
                    <td className="py-3 text-body">{r.label}</td>
                    {tablePlans.map((p) => (
                      <td key={p.id} className="py-3 text-ink">
                        {r.get(p)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-b border-hairline">
                  <td className="py-3 text-body">Voz, atendimento, transcrição e telefonia</td>
                  {tablePlans.map((p) => (
                    <td key={p.id} className="py-3 text-ink">
                      Inclusos
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="mt-16 text-[0.9375rem] text-ink">Adicionais</h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {ADDONS.map((a) => (
              <li key={a.id} className="panel p-4">
                <p className="text-sm text-ink">{a.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{a.priceLabel}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rule-t">
        <div className="container-page grid gap-10 py-24 lg:grid-cols-[1fr_2fr]">
          <h2 className="display-section">Perguntas frequentes</h2>
          <Faq items={FAQ} />
        </div>
      </section>
    </div>
  );
}
