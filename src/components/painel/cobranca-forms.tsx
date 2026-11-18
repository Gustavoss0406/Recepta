"use client";

import { useActionState, useState } from "react";
import { escolherPlano, salvarLimites } from "@/app/painel/cobranca/actions";
import { BotaoEnviar, Erro } from "@/components/ui/form";

interface PlanoView {
  id: string;
  name: string;
  priceBrl: number;
  includedMinutes: number;
  overageBrl: number;
  concurrency: number;
  featured?: boolean;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v % 1 ? 2 : 0 });

export function EscolherPlano({ planos, atual, podeGerenciar }: { planos: PlanoView[]; atual: string; podeGerenciar: boolean }) {
  const [ciclo, setCiclo] = useState<"mensal" | "anual">("mensal");
  const [estado, acao] = useActionState(escolherPlano, undefined);
  return (
    <div>
      <div role="tablist" aria-label="Ciclo" className="mb-4 inline-flex gap-1 rounded-full bg-white p-1 shadow-[var(--shadow-pill)]">
        {(["mensal", "anual"] as const).map((c) => (
          <button key={c} role="tab" aria-selected={ciclo === c} onClick={() => setCiclo(c)} className={`h-8 rounded-full px-4 text-sm ${ciclo === c ? "bg-ink text-white" : "text-body"}`}>
            {c === "mensal" ? "Mensal" : "Anual · 2 meses grátis"}
          </button>
        ))}
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {planos.map((p) => (
          <form key={p.id} action={acao} className={`flex flex-col rounded-[16px] p-5 ${p.featured ? "bg-dark text-white" : "panel"}`}>
            <input type="hidden" name="plano" value={p.id} />
            <input type="hidden" name="ciclo" value={ciclo} />
            <p className="text-[0.9375rem]">{p.name}</p>
            <p className="mt-4">
              <span className="text-[1.75rem] font-medium tracking-[-0.03em]">{brl(ciclo === "anual" ? p.priceBrl * 10 : p.priceBrl)}</span>
              <span className={p.featured ? "text-white/60" : "text-muted-foreground"}>/{ciclo === "anual" ? "ano" : "mês"}</span>
            </p>
            <p className={`mt-2 text-sm ${p.featured ? "text-white/70" : "text-muted-foreground"}`}>
              {p.includedMinutes.toLocaleString("pt-BR")} min/mês · {p.concurrency} simultâneas · extra {brl(p.overageBrl)}/min
            </p>
            {podeGerenciar && (
              <BotaoEnviar className={`btn btn-sm mt-6 ${p.featured ? "btn-on-dark" : "btn-primary"} ${atual === p.id ? "pointer-events-none opacity-50" : ""}`}>
                {atual === p.id ? "Plano atual" : `Mudar para ${p.name}`}
              </BotaoEnviar>
            )}
          </form>
        ))}
      </div>
      <Erro mensagem={estado?.erro} />
      {estado?.ok && <p className="mt-3 text-sm text-success">✓ {estado.mensagem}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Ao mudar de plano, o novo ciclo começa hoje e o valor não usado do plano anterior vira crédito na fatura.</p>
    </div>
  );
}

export function Limites({ teto, pico, podeGerenciar }: { teto: number | null; pico: boolean; podeGerenciar: boolean }) {
  const [estado, acao] = useActionState(salvarLimites, undefined);
  return (
    <form action={acao} className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-xs text-muted-foreground">Teto mensal (R$). Ao atingir, a recepcionista só registra os pedidos e passa para a equipe até o próximo ciclo.</span>
        <input name="teto" defaultValue={teto ?? ""} placeholder="Sem teto" inputMode="decimal" className="field max-w-48" disabled={!podeGerenciar} />
      </label>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="pico" defaultChecked={pico} className="size-4 accent-black" disabled={!podeGerenciar} />
        Modo pico: atender acima das chamadas simultâneas do plano (minuto em dobro)
      </label>
      {podeGerenciar && (
        <div className="flex items-center gap-3">
          <BotaoEnviar className="btn btn-sm btn-secondary">Salvar limites</BotaoEnviar>
          {estado?.ok && <span className="text-sm text-success">✓ {estado.mensagem}</span>}
        </div>
      )}
    </form>
  );
}
