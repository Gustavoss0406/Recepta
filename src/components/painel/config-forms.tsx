"use client";

import { useActionState } from "react";
import { convidar, criarChaveApi, salvarLgpd } from "@/app/painel/configuracoes/actions";
import { BotaoEnviar, Erro } from "@/components/ui/form";

export function Convidar() {
  const [e, a] = useActionState(convidar, undefined);
  return (
    <form action={a} className="flex flex-wrap gap-2">
      <input name="email" type="email" placeholder="email@empresa.com" className="field min-w-56 flex-1" required />
      <select name="papel" defaultValue="atendente" className="field !w-40">
        <option value="gestor">Gestor</option>
        <option value="atendente">Atendente</option>
        <option value="financeiro">Financeiro</option>
        <option value="dono">Dono</option>
      </select>
      <BotaoEnviar className="btn btn-sm btn-primary !h-11">Convidar</BotaoEnviar>
      {e?.ok && <p className="w-full rounded-[10px] bg-[#e8f7ee] px-3 py-2 text-xs break-all text-[#0f6b34]">{e.mensagem}</p>}
      <div className="w-full">
        <Erro mensagem={e?.erro} />
      </div>
    </form>
  );
}

export function Lgpd({ audio, transcricao, mascarar }: { audio: number; transcricao: number; mascarar: boolean }) {
  const [e, a] = useActionState(salvarLgpd, undefined);
  return (
    <form action={a} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted-foreground">Guardar áudios por (dias)</span>
          <input name="audio" type="number" min={1} max={3650} defaultValue={audio} className="field" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted-foreground">Guardar transcrições por (dias)</span>
          <input name="transcricao" type="number" min={1} max={3650} defaultValue={transcricao} className="field" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="mascarar" defaultChecked={mascarar} className="size-4 accent-black" /> Mascarar CPF e números de cartão nas transcrições
      </label>
      <div className="flex items-center gap-3">
        <BotaoEnviar className="btn btn-sm btn-secondary">Salvar política</BotaoEnviar>
        {e?.ok && <span className="text-sm text-success">✓ {e.mensagem}</span>}
      </div>
    </form>
  );
}

export function NovaChave() {
  const [e, a] = useActionState(criarChaveApi, undefined);
  return (
    <form action={a} className="space-y-2">
      <div className="flex gap-2">
        <input name="nome" placeholder="Nome da chave (ex.: CRM)" className="field" />
        <BotaoEnviar className="btn btn-sm btn-primary !h-11">Criar chave</BotaoEnviar>
      </div>
      {e?.ok && (
        <p className="rounded-[10px] bg-[#e8f7ee] px-3 py-2 text-xs text-[#0f6b34]">
          Copie agora, ela não será mostrada de novo: <code className="font-mono break-all">{e.mensagem}</code>
        </p>
      )}
    </form>
  );
}
