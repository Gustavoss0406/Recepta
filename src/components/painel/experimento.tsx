"use client";

import { useActionState, useState } from "react";
import { acaoEncerrarExperimento, acaoIniciarExperimento } from "@/app/painel/actions";
import { BotaoEnviar, Erro } from "@/components/ui/form";
import type { ResultadoVariante } from "@/server/agent/experimentos";
import { cn } from "@/lib/utils";

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

export function NovoExperimento({ agenteId, versoes }: { agenteId: string; versoes: { id: string; numero: number; nota: string | null }[] }) {
  const [estado, acao] = useActionState(acaoIniciarExperimento.bind(null, agenteId), undefined);
  const [p, setP] = useState(50);
  if (!versoes.length) return <p className="text-sm text-muted-foreground">Publique pelo menos duas versões para comparar.</p>;
  return (
    <form action={acao} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted-foreground">Versão B (desafiante)</span>
          <select name="versaoB" className="field">
            {versoes.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.numero} {v.nota ? `· ${v.nota}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 flex justify-between text-xs text-muted-foreground">
            Tráfego para B <span className="font-medium text-foreground tabular-nums">{p}%</span>
          </span>
          <input name="percentual" type="range" min={10} max={90} step={10} value={p} onChange={(e) => setP(Number(e.target.value))} className="mt-3 w-full accent-black" />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <BotaoEnviar className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-white hover:bg-foreground/85">Iniciar experimento</BotaoEnviar>
        <Erro mensagem={estado?.erro} />
      </div>
    </form>
  );
}

export function ExperimentoAtivo({ agenteId, a, b, percentualB, desde }: { agenteId: string; a: ResultadoVariante; b: ResultadoVariante; percentualB: number; desde: string }) {
  const linhas = [
    { r: a, rotulo: "A", parte: 100 - percentualB, selo: "No ar" },
    { r: b, rotulo: "B", parte: percentualB, selo: "Desafiante" },
  ];
  const melhor = a.ligacoes && b.ligacoes ? (b.resolvidas / b.ligacoes > a.resolvidas / a.ligacoes ? "B" : "A") : null;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[14px] border border-border bg-background">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-normal">Versão</th>
              <th className="px-2 py-2.5 font-normal">Tráfego</th>
              <th className="px-2 py-2.5 text-right font-normal">Ligações</th>
              <th className="px-2 py-2.5 text-right font-normal">Resolvidas</th>
              <th className="px-2 py-2.5 text-right font-normal">Sucesso</th>
              <th className="px-4 py-2.5 text-right font-normal">À equipe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhas.map(({ r, rotulo, parte, selo }) => (
              <tr key={rotulo}>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs">v{r.numero}</span>
                    <span className={cn("rounded-[6px] px-1.5 py-0.5 text-xs font-medium", rotulo === "A" ? "bg-[#e9f7ef] text-[#147a3d]" : "bg-[#eaf1fe] text-[#1d4fd7]")}>{selo}</span>
                    {melhor === rotulo && <span className="text-xs text-muted-foreground">melhor resolução</span>}
                  </span>
                </td>
                <td className="px-2 py-3">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-[#2563eb]" style={{ width: `${parte}%` }} />
                    </span>
                    <span className="text-xs tabular-nums">{parte}%</span>
                  </span>
                </td>
                <td className="px-2 py-3 text-right tabular-nums">{r.ligacoes}</td>
                <td className="px-2 py-3 text-right tabular-nums">{pct(r.resolvidas, r.ligacoes)}</td>
                <td className="px-2 py-3 text-right tabular-nums">{pct(r.sucesso, r.ligacoes)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{pct(r.repassadas, r.ligacoes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Desde {desde}. Ligações em andamento terminam na versão em que começaram. {a.ligacoes + b.ligacoes < 30 && "Com menos de 30 ligações por versão, a diferença ainda pode ser acaso."}
      </p>
      <div className="flex flex-wrap gap-2">
        <form action={acaoEncerrarExperimento.bind(null, agenteId, "B")}>
          <button type="submit" className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-white hover:bg-foreground/85">
            Promover B (v{b.numero})
          </button>
        </form>
        <form action={acaoEncerrarExperimento.bind(null, agenteId, "A")}>
          <button type="submit" className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm hover:bg-accent">
            Manter A e encerrar
          </button>
        </form>
      </div>
    </div>
  );
}
