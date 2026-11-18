"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { acaoSalvarColegas, type Resultado } from "@/app/painel/actions";
import { BOTAO } from "@/components/painel/page-header";
import { Orb } from "@/components/ui/orb";
import { cn } from "@/lib/utils";

interface Opcao {
  id: string;
  nome: string;
  rotulo: string;
  publicado: boolean;
}

/** Which other receptionists can take over a call, and when. */
export function Colegas({ agenteId, opcoes, atuais }: { agenteId: string; opcoes: Opcao[]; atuais: { agenteId: string; quando: string }[] }) {
  const [sel, setSel] = useState<Record<string, string | null>>(() => Object.fromEntries(opcoes.map((o) => [o.id, atuais.find((a) => a.agenteId === o.id)?.quando ?? null])));
  const [r, setR] = useState<Resultado>(undefined);
  const [salvando, iniciar] = useTransition();

  return (
    <section className="rounded-[18px] border border-border p-4">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-muted-foreground" />
        <h2 className="text-[0.9375rem] font-medium text-foreground">Passar para outra recepcionista</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        No meio da ligação, ela passa o cliente para uma colega, por exemplo do financeiro. A ligação continua a mesma, com todo o histórico; muda a voz e as regras.
      </p>
      {opcoes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Crie outra recepcionista em{" "}
          <Link href="/painel/agentes" className="underline">
            Agentes
          </Link>{" "}
          para usar esta opção.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {opcoes.map((o) => {
            const ativo = sel[o.id] !== null;
            return (
              <li key={o.id} className={cn("rounded-[14px] border p-3", ativo ? "border-foreground/30" : "border-border")}>
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input type="checkbox" checked={ativo} onChange={(e) => setSel((v) => ({ ...v, [o.id]: e.target.checked ? "" : null }))} className="size-4 accent-foreground" />
                  <Orb tom="mint" tamanho={22} />
                  <span className="text-sm text-foreground">{o.nome}</span>
                  <span className="truncate text-xs text-muted-foreground">{o.rotulo}</span>
                  {!o.publicado && <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] text-muted-foreground">não publicada</span>}
                </label>
                {ativo && (
                  <input
                    value={sel[o.id] ?? ""}
                    onChange={(e) => setSel((v) => ({ ...v, [o.id]: e.target.value }))}
                    placeholder="Quando passar? Ex.: dúvidas de pagamento, boleto ou nota fiscal"
                    maxLength={200}
                    className="field mt-2 h-9"
                    aria-label={`Quando passar para ${o.nome}`}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {opcoes.length > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={salvando}
            onClick={() =>
              iniciar(async () =>
                setR(
                  await acaoSalvarColegas(
                    agenteId,
                    Object.entries(sel)
                      .filter(([, q]) => q !== null)
                      .map(([id, q]) => ({ agenteId: id, quando: q ?? "" })),
                  ),
                ),
              )
            }
            className={cn(BOTAO.primario, "h-8 px-3")}
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          {r && <span className={cn("text-sm", r.erro ? "text-[#b42318]" : "text-[#147a3d]")}>{r.erro ?? r.mensagem}</span>}
        </div>
      )}
    </section>
  );
}
