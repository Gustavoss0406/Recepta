"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { salvarDesvio, verificarDesvio, type R } from "@/app/painel/numeros/actions";
import { BotaoEnviar, Erro } from "@/components/ui/form";

const OPERADORAS = ["Vivo", "Claro", "TIM", "Oi", "Algar", "Outra"];
const MODOS = [
  { id: "nao_atende_ocupado", nome: "Se não atender ou estiver ocupado", rec: true },
  { id: "sempre", nome: "Sempre (todas as ligações)" },
  { id: "nao_atende", nome: "Só se não atender" },
];

/** GSM supplementary-service codes used by Brazilian mobile carriers (verify per carrier before launch). */
function codigos(modo: string, destino: string): { rotulo: string; codigo: string }[] {
  const n = destino.replace(/[^\d+]/g, "").replace(/^\+55/, "0");
  if (modo === "sempre") return [{ rotulo: "Desviar sempre", codigo: `*21*${n}#` }];
  if (modo === "nao_atende") return [{ rotulo: "Se não atender", codigo: `*61*${n}#` }];
  return [
    { rotulo: "Se não atender", codigo: `*61*${n}#` },
    { rotulo: "Se ocupado", codigo: `*67*${n}#` },
    { rotulo: "Fora de área", codigo: `*62*${n}#` },
  ];
}

export function Desvio({
  numero,
}: {
  numero: { e164: string; desvioDe: string | null; operadora: string | null; modoDesvio: string | null; verificadoEm: Date | null } | null;
}) {
  const [estado, salvar] = useActionState(salvarDesvio, undefined);
  const [modo, setModo] = useState(numero?.modoDesvio ?? "nao_atende_ocupado");
  const [ver, setVer] = useState<R>(undefined);
  const [pendente, iniciar] = useTransition();
  const [copiado, setCopiado] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <form action={salvar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">Número atual da empresa</span>
            <input name="desvioDe" defaultValue={numero?.desvioDe ?? ""} placeholder="(11) 98765-4321" className="field" required />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">Operadora</span>
            <select name="operadora" defaultValue={numero?.operadora ?? "Vivo"} className="field">
              {OPERADORAS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-xs text-muted-foreground">Quando desviar</legend>
          {MODOS.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-hairline-strong bg-white px-3 py-2.5 text-sm has-[:checked]:border-ink has-[:checked]:shadow-[0_0_0_1px_#000]">
              <input type="radio" name="modo" value={m.id} checked={modo === m.id} onChange={() => setModo(m.id)} className="accent-black" />
              {m.nome}
              {m.rec && <span className="badge !text-[0.7rem]">Recomendado</span>}
            </label>
          ))}
        </fieldset>
        <div className="flex items-center gap-3">
          <BotaoEnviar className="btn btn-sm btn-primary">Salvar desvio</BotaoEnviar>
          {estado?.ok && <span className="text-sm text-success">✓ {estado.mensagem}</span>}
        </div>
        <Erro mensagem={estado?.erro} />
      </form>

      {numero && (
        <div className="rounded-[12px] bg-white p-4 shadow-[var(--shadow-pill)]">
          <p className="text-sm text-ink">No celular da empresa, disque os códigos abaixo:</p>
          <p className="mt-1 text-xs text-muted-foreground">Número da Recepta que recebe as ligações: {numero.e164}</p>
          <ul className="mt-3 space-y-2">
            {codigos(modo, numero.e164).map((c) => (
              <li key={c.codigo} className="flex items-center justify-between gap-3 rounded-[10px] bg-strong px-3 py-2">
                <span className="text-sm text-body">{c.rotulo}</span>
                <span className="flex items-center gap-2">
                  <code className="font-mono text-sm text-ink">{c.codigo}</code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(c.codigo);
                      setCopiado(c.codigo);
                      setTimeout(() => setCopiado(null), 1500);
                    }}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white"
                    aria-label={`Copiar ${c.codigo}`}
                  >
                    {copiado === c.codigo ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Para cancelar todos os desvios: ##002#. Em linha fixa, os códigos variam por operadora.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pendente}
              onClick={() => iniciar(async () => setVer(await verificarDesvio()))}
              className="btn btn-sm btn-secondary"
            >
              {numero.verificadoEm ? "Verificar de novo" : "Verificar desvio"}
            </button>
            {numero.verificadoEm && !ver && <span className="text-sm text-success">✓ Verificado</span>}
            {ver?.ok && <span className="text-sm text-success">{ver.mensagem}</span>}
            {ver?.erro && <span className="text-sm text-error">{ver.erro}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
