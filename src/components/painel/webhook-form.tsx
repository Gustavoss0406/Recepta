"use client";

import { useActionState } from "react";
import { criarWebhook } from "@/app/painel/integracoes/actions";
import { BotaoEnviar, Erro } from "@/components/ui/form";

export function NovoWebhook() {
  const [estado, acao] = useActionState(criarWebhook, undefined);
  return (
    <form action={acao} className="space-y-3">
      <input name="url" placeholder="https://sua-api.com/recepta" className="field" required />
      <div className="flex flex-wrap gap-3 text-sm">
        {[
          ["call.ended", "Ligação encerrada"],
          ["call.transferred", "Ligação transferida"],
          ["test.failed", "Teste reprovado"],
        ].map(([v, l]) => (
          <label key={v} className="flex items-center gap-2">
            <input type="checkbox" name="eventos" value={v} defaultChecked={v === "call.ended"} className="size-4 accent-black" /> {l}
          </label>
        ))}
      </div>
      <BotaoEnviar className="btn btn-sm btn-primary">Adicionar webhook</BotaoEnviar>
      {estado?.ok && <p className="rounded-[10px] bg-[#e8f7ee] px-3 py-2 font-mono text-xs break-all text-[#0f6b34]">{estado.mensagem}</p>}
      <Erro mensagem={estado?.erro} />
    </form>
  );
}
