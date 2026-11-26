"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp, Plus } from "lucide-react";

/** Describe a change to the flow in plain words: the configuration assistant takes it from there. */
export function PromptFluxo({ agenteId }: { agenteId: string }) {
  const [t, setT] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (t.trim()) router.push(`/painel/agentes/${agenteId}?aba=agente&pedido=${encodeURIComponent(t.trim())}`);
      }}
      className="mx-auto mt-6 flex max-w-[560px] items-center gap-2 rounded-full border border-border bg-white p-1.5 pl-4 shadow-[0_8px_24px_rgba(0,0,0,.05)]"
    >
      <Plus size={17} className="shrink-0 text-muted-foreground" />
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Quando for urgência, transfira pro plantão…" aria-label="Mudança no fluxo" className="h-9 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-[0.9375rem]" />
      <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">Assistente</span>
      <button type="submit" disabled={!t.trim()} aria-label="Enviar" className="grid size-9 place-items-center rounded-full bg-foreground text-white disabled:bg-[#a3a3a3]">
        <ArrowUp size={16} />
      </button>
    </form>
  );
}
