"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { recommendPlan, RECEPCIONISTA_BRL_MES } from "@/lib/pricing/recommend";
import { formatBRL, formatBRLRound, formatInt } from "@/lib/format";

const MAX = 12_000;

/** Two-step calculator: monthly minutes → recommended plan, bill, and comparison with a receptionist. */
export function PriceCalculator() {
  const [minutes, setMinutes] = useState(400);
  const id = useId();
  const rec = recommendPlan(minutes);
  const enterprise = rec.monthlyBrl == null;
  const calls = Math.round(minutes / 2.5);

  return (
    <div className="panel grid gap-1 p-1.5 lg:grid-cols-[1.3fr_1fr]">
      <div className="rounded-[12px] bg-white p-6 sm:p-8">
        <p className="font-mono text-xs text-muted-foreground">1</p>
        <label htmlFor={id} className="mt-2 block text-[0.9375rem] text-ink">
          Quantos minutos de ligação por mês?
        </label>
        <p className="mt-1 text-sm text-muted-foreground">Uma ligação de atendimento dura em média 2 a 3 minutos.</p>
        <div className="mt-8 flex items-baseline justify-between">
          <output htmlFor={id} className="display-section">
            {formatInt(minutes)} min
          </output>
          <span className="text-sm text-muted-foreground">≈ {formatInt(calls)} ligações</span>
        </div>
        <input
          id={id}
          type="range"
          min={50}
          max={MAX}
          step={50}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="mt-4 w-full accent-black"
          aria-valuetext={`${minutes} minutos por mês`}
        />
        <div className="mt-1 flex justify-between font-mono text-xs text-muted-foreground">
          <span>50</span>
          <span>{formatInt(MAX)}+</span>
        </div>

        <p className="mt-10 font-mono text-xs text-muted-foreground">2</p>
        <p className="mt-2 text-[0.9375rem] text-ink">Tudo isso já está incluso</p>
        <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm text-body sm:grid-cols-2">
          {["Número local ou desvio", "Inteligência artificial", "Voz brasileira", "Transcrição e gravação", "Resumo por WhatsApp", "Suporte em português"].map(
            (f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-ink" /> {f}
              </li>
            ),
          )}
        </ul>
      </div>

      <div className="flex flex-col rounded-[12px] bg-dark p-6 text-white sm:p-8" aria-live="polite">
        <p className="text-sm text-white/60">Plano recomendado</p>
        <p className="mt-1 text-[0.9375rem]">{rec.plan.name}</p>
        {enterprise ? (
          <>
            <p className="mt-6 display-section">Sob consulta</p>
            <p className="mt-2 text-sm text-white/70">Acima de 10 mil minutos, o preço por minuto cai para R$ 0,49–0,62.</p>
            <Link href="mailto:vendas@recepta.ai" className="btn btn-sm btn-on-dark mt-auto self-start">
              Falar com vendas
            </Link>
          </>
        ) : (
          <>
            <p className="mt-6">
              <span className="display-section">{formatBRL(rec.monthlyBrl)}</span>
              <span className="text-white/60"> /mês</span>
            </p>
            <p className="mt-2 text-sm text-white/70">
              {formatInt(rec.plan.includedMinutes)} min inclusos
              {"overageMinutes" in rec && rec.overageMinutes > 0
                ? ` + ${formatInt(rec.overageMinutes)} min extras a ${formatBRL(rec.plan.overageBrl!)}`
                : ""}
              {" · "}
              {formatBRL(rec.effectivePerMinute)}/min
            </p>
            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="text-sm text-white/60">Comparado a uma recepcionista CLT</p>
              <p className="mt-1 text-[0.9375rem]">
                {rec.monthlyBrl < RECEPCIONISTA_BRL_MES
                  ? `Economia de ${formatBRLRound(RECEPCIONISTA_BRL_MES - rec.monthlyBrl)} por mês, atendendo 24 horas`
                  : "Atendimento 24 horas, sem fila e sem ligação perdida"}
              </p>
            </div>
            <Link href="/criar-conta" className="btn btn-sm btn-on-dark mt-8 self-start">
              Começar com {rec.plan.name}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
