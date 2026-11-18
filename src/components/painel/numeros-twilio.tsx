"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Phone, Search } from "lucide-react";
import {
  apontarNumeroTwilio,
  buscarNumeros,
  comprarNumeroTwilio,
  liberarNumeroTwilio,
  usarNumeroDaConta,
  type R,
} from "@/app/painel/numeros/actions";
import { BOTAO } from "@/components/painel/page-header";
import { cn } from "@/lib/utils";

export interface NumeroProprio {
  id: string;
  e164: string;
  apontado: boolean;
}
export interface NumeroLivre {
  sid: string;
  numero: string;
  formatado: string;
}

const PAISES = [
  { id: "US", nome: "Estados Unidos (+1)", ddd: "Código de área, ex.: 857" },
  { id: "BR", nome: "Brasil (+55)", ddd: "DDD, ex.: 11" },
  { id: "CA", nome: "Canadá (+1)", ddd: "Código de área" },
  { id: "PT", nome: "Portugal (+351)", ddd: "Prefixo" },
];

const formatar = (e164: string) =>
  e164.startsWith("+1") && e164.length === 12
    ? `+1 (${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`
    : e164.startsWith("+55")
      ? `+55 ${e164.slice(3, 5)} ${e164.slice(5, -4)}-${e164.slice(-4)}`
      : e164;

function Aviso({ r }: { r: R }) {
  if (!r) return null;
  return <p className={cn("rounded-[10px] px-3 py-2 text-sm", r.erro ? "bg-[#fdecec] text-[#b42318]" : "bg-[#e9f7ef] text-[#147a3d]")}>{r.erro ?? r.mensagem}</p>;
}

export function NumerosTwilio({
  origem,
  proprios,
  livres,
  urlPublica,
}: {
  origem: "cliente" | "plataforma" | null;
  proprios: NumeroProprio[];
  livres: NumeroLivre[];
  urlPublica: boolean;
}) {
  const [busca, buscar] = useActionState(buscarNumeros, undefined);
  const [pais, setPais] = useState("US");
  const [r, setR] = useState<R>(undefined);
  const [pendente, iniciar] = useTransition();
  const agir = (f: () => Promise<R>) => iniciar(async () => setR(await f()));

  if (!origem)
    return (
      <div className="rounded-[14px] border border-border p-4 text-sm">
        <p className="text-foreground">Conecte uma conta Twilio para ter um número exclusivo da recepcionista.</p>
        <Link href="/painel/integracoes" className={cn(BOTAO.secundario, "mt-3 h-8 px-3")}>
          Conectar Twilio
        </Link>
      </div>
    );

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        {origem === "cliente" ? "Usando a sua conta Twilio (cobrança direto na Twilio)." : "Número fornecido pela Recepta."}
        {!urlPublica && " Ambiente sem URL pública: os números ficam salvos, mas só atendem depois de apontados."}
      </p>

      {proprios.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border">
          {proprios.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="grid size-8 place-items-center rounded-full bg-muted">
                <Phone size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-sm text-foreground">{formatar(n.e164)}</span>
                <span className={cn("text-xs", n.apontado ? "text-[#147a3d]" : "text-muted-foreground")}>
                  {n.apontado ? "Atendendo com a recepcionista" : "Ainda não apontado para a recepcionista"}
                </span>
              </span>
              {!n.apontado && (
                <button type="button" disabled={pendente || !urlPublica} onClick={() => agir(() => apontarNumeroTwilio(n.id))} className={cn(BOTAO.primario, "h-8 px-3")}>
                  Apontar
                </button>
              )}
              <button
                type="button"
                disabled={pendente}
                onClick={() => confirm(origem === "plataforma" ? "Liberar este número? Ele deixa de ser seu." : "Remover este número da recepcionista?") && agir(() => liberarNumeroTwilio(n.id))}
                className="h-8 rounded-full px-2 text-sm text-muted-foreground hover:text-destructive"
              >
                {origem === "plataforma" ? "Liberar" : "Remover"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {livres.length > 0 && (
        <div>
          <p className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">Já na sua conta Twilio</p>
          <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border">
            {livres.map((n) => (
              <li key={n.sid} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 font-mono text-sm">{formatar(n.numero)}</span>
                <button type="button" disabled={pendente} onClick={() => agir(() => usarNumeroDaConta(n.sid))} className={cn(BOTAO.secundario, "h-8 px-3")}>
                  Usar com a recepcionista
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form action={buscar} className="rounded-[14px] border border-border p-3">
        <p className="mb-2 text-[0.8125rem] font-medium text-foreground">Comprar número</p>
        <div className="flex flex-wrap gap-2">
          <select name="pais" value={pais} onChange={(e) => setPais(e.target.value)} className="field h-9 w-auto" aria-label="País">
            {PAISES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <input name="ddd" inputMode="numeric" placeholder={PAISES.find((p) => p.id === pais)?.ddd} className="field h-9 min-w-0 flex-1" aria-label="DDD ou código de área" />
          <button type="submit" className={cn(BOTAO.secundario, "h-9")}>
            <Search size={14} /> Buscar
          </button>
        </div>
        {pais === "BR" && <p className="mt-2 text-xs text-muted-foreground">Números do Brasil exigem cadastro regulatório na Twilio (CNPJ e endereço) antes da compra.</p>}
        {busca?.erro && <p className="mt-3 text-sm text-[#b42318]">{busca.erro}</p>}
        {busca?.numeros && (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-[12px] border border-border">
            {busca.numeros.map((n) => (
              <li key={n.numero} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm">{formatar(n.numero)}</span>
                  {n.local && <span className="text-xs text-muted-foreground">{n.local}</span>}
                </span>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => confirm(`Comprar ${formatar(n.numero)}? A Twilio cobra a mensalidade do número.`) && agir(() => comprarNumeroTwilio(n.numero))}
                  className={cn(BOTAO.primario, "h-8 px-3")}
                >
                  Comprar
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
      <Aviso r={r} />
    </div>
  );
}
