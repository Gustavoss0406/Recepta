"use client";

import { useActionState } from "react";
import { onboardingEmpresa, onboardingSite } from "@/app/painel/actions";
import { BotaoEnviar, Erro } from "@/components/ui/form";

export function FormEmpresa({ org }: { org: { nome: string; nicho: string; cnpj: string | null; cidade: string | null; telefoneContato: string | null } }) {
  const [estado, acao] = useActionState(onboardingEmpresa, undefined);
  return (
    <form action={acao} className="max-w-xl space-y-4">
      <Erro mensagem={estado?.erro} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs text-muted-foreground">Nome da empresa</span>
          <input name="nome" defaultValue={org.nome} className="field" required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted-foreground">CNPJ (opcional no teste)</span>
          <input name="cnpj" defaultValue={org.cnpj ?? ""} className="field" inputMode="numeric" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted-foreground">Cidade</span>
          <input name="cidade" defaultValue={org.cidade ?? ""} className="field" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs text-muted-foreground">Seu WhatsApp (para receber o resumo de cada ligação)</span>
          <input name="telefoneContato" defaultValue={org.telefoneContato ?? ""} placeholder="(11) 98765-4321" className="field" />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-xs text-muted-foreground">Tipo de negócio</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["clinica", "Clínica ou consultório"],
            ["imobiliaria", "Imobiliária"],
            ["restaurante", "Restaurante"],
          ].map(([id, nome]) => (
            <label key={id} className="flex h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-hairline-strong bg-white px-3 text-sm has-[:checked]:border-ink has-[:checked]:shadow-[0_0_0_1px_#000]">
              <input type="radio" name="nicho" value={id} defaultChecked={org.nicho === id} className="accent-black" />
              {nome}
            </label>
          ))}
        </div>
      </fieldset>
      <BotaoEnviar className="btn btn-primary">Continuar</BotaoEnviar>
    </form>
  );
}

export function FormSite() {
  const [estado, acao] = useActionState(onboardingSite, undefined);
  return (
    <form action={acao} className="max-w-xl space-y-4">
      <Erro mensagem={estado?.erro} />
      <label className="block">
        <span className="mb-1.5 block text-xs text-muted-foreground">Endereço do site</span>
        <input name="url" placeholder="www.suaempresa.com.br" className="field" />
      </label>
      <details className="rounded-[12px] bg-white p-3 shadow-[var(--shadow-pill)]">
        <summary className="cursor-pointer text-sm text-ink">Não tenho site</summary>
        <textarea
          name="texto"
          rows={6}
          placeholder="Escreva serviços, preços, horários, endereço, formas de pagamento e perguntas frequentes."
          className="field mt-3 !h-auto py-2.5"
        />
      </details>
      <BotaoEnviar className="btn btn-primary">Ler e aprender</BotaoEnviar>
      <p className="text-xs text-muted-foreground">Leremos até 30 páginas públicas do seu site. Isso leva até 1 minuto.</p>
    </form>
  );
}
