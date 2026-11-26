"use client";

import { useState, useTransition } from "react";
import { PhoneCall } from "lucide-react";
import { meLigueAgora } from "@/app/painel/me-ligue-actions";
import { cn } from "@/lib/utils";

/** Real phone test without touching the company's number: the receptionist calls the owner. */
export function MeLigue({ agenteId, telefone, restantes, className }: { agenteId: string; telefone?: string | null; restantes: number; className?: string }) {
  const [numero, setNumero] = useState(telefone ?? "");
  const [msg, setMsg] = useState<{ ok?: boolean; texto: string } | null>(null);
  const [falta, setFalta] = useState(restantes);
  const [pendente, iniciar] = useTransition();
  return (
    <div className={cn("rounded-[16px] border border-border bg-white p-4", className)} data-testid="me-ligue">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-[#22a35a]/10 text-[#22a35a]">
          <PhoneCall size={15} />
        </span>
        <div>
          <p className="text-sm font-medium">Me ligue agora</p>
          <p className="text-xs text-muted-foreground">Sua recepcionista liga pro seu celular. Sem mexer no número da empresa.</p>
        </div>
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            setMsg(null);
            const r = await meLigueAgora(agenteId, numero);
            setMsg(r.erro ? { texto: r.erro } : { ok: true, texto: r.mensagem ?? "Ligando!" });
            if (r.ok) setFalta((x) => Math.max(0, x - 1));
          });
        }}
      >
        <input type="tel" inputMode="tel" autoComplete="tel" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="(11) 98765-4321" aria-label="Seu celular" className="h-10 min-w-0 flex-1 rounded-[10px] border border-border px-3 text-base sm:text-sm" />
        <button type="submit" disabled={pendente || falta <= 0 || numero.replace(/\D/g, "").length < 10} className="btn btn-primary btn-sm !h-10 shrink-0">
          {pendente ? "Chamando…" : "Me ligue"}
        </button>
      </form>
      {msg && <p className={cn("mt-2 text-sm", msg.ok ? "text-[#22a35a]" : "text-error")}>{msg.texto}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        É uma ligação de verdade com o seu rascunho: o que ela marcar vai para a agenda, os casos viram pendências e os avisos são enviados. Não conta minutos do seu plano · {falta} de 3 hoje · até 10 min.
      </p>
    </div>
  );
}
