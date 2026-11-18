"use client";

import { useActionState } from "react";
import { acaoPublicar } from "@/app/painel/actions";
import { BotaoEnviar, Erro } from "@/components/ui/form";

export function PublicarForm({ agenteId, onboarding = false, podeForcar }: { agenteId: string; onboarding?: boolean; podeForcar: boolean }) {
  const [estado, acao] = useActionState(acaoPublicar.bind(null, agenteId), undefined);
  const bloqueado = estado?.erro?.startsWith("Publicação bloqueada");
  return (
    <form action={acao} className="max-w-xl space-y-3">
      {onboarding && <input type="hidden" name="onboarding" value="1" />}
      <label className="block">
        <span className="mb-1.5 block text-xs text-muted-foreground">Nota da versão (opcional)</span>
        <input name="nota" className="field" placeholder="Ex.: ajustei os horários de sábado" />
      </label>
      {bloqueado && podeForcar && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="forcar" className="size-4 accent-black" /> Publicar mesmo assim (fica registrado)
        </label>
      )}
      <div className="flex items-center gap-3">
        <BotaoEnviar className="btn btn-primary">Rodar testes e publicar</BotaoEnviar>
        {estado?.ok && <span className="text-sm text-success">✓ {estado.mensagem}</span>}
      </div>
      <Erro mensagem={estado?.erro} />
      {bloqueado && !podeForcar && <p className="text-xs text-muted-foreground">Só o Dono da conta pode publicar com testes críticos reprovados.</p>}
    </form>
  );
}
