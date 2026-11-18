"use client";

import Link from "next/link";
import { useActionState } from "react";
import { acaoCriarConta } from "../actions";
import { BotaoEnviar, Campo, Erro } from "@/components/ui/form";

const NICHOS = [
  { id: "clinica", nome: "Clínica ou consultório" },
  { id: "imobiliaria", nome: "Imobiliária" },
  { id: "restaurante", nome: "Restaurante" },
];

export default function CriarContaPage() {
  const [estado, acao] = useActionState(acaoCriarConta, undefined);
  const c = estado?.campos ?? {};
  return (
    <>
      <h1 className="display-section">Crie sua conta</h1>
      <p className="mt-2 text-[0.9375rem] text-muted-foreground">7 dias grátis com 30 minutos de ligação. Sem cartão.</p>
      <form action={acao} className="mt-8 space-y-4">
        <Erro mensagem={estado?.erro} />
        <Campo label="Seu nome" name="nome" autoComplete="name" defaultValue={c.nome} />
        <Campo label="E-mail" name="email" type="email" autoComplete="email" defaultValue={c.email} />
        <Campo label="Senha" name="senha" type="password" autoComplete="new-password" minLength={8} hint="Pelo menos 8 caracteres" />
        <Campo label="Nome da empresa" name="empresa" autoComplete="organization" defaultValue={c.empresa} />
        <fieldset>
          <legend className="text-sm text-ink">Tipo de negócio</legend>
          <div className="mt-1.5 grid gap-1.5">
            {NICHOS.map((n, i) => (
              <label key={n.id} className="flex h-11 cursor-pointer items-center gap-3 rounded-[10px] border border-hairline-strong bg-white px-3.5 text-[0.9375rem] has-[:checked]:border-ink has-[:checked]:shadow-[0_0_0_1px_#000]">
                <input type="radio" name="nicho" value={n.id} defaultChecked={c.nicho ? c.nicho === n.id : i === 0} className="accent-black" />
                {n.nome}
              </label>
            ))}
          </div>
        </fieldset>
        <BotaoEnviar>Criar conta grátis</BotaoEnviar>
        <p className="text-xs text-muted-foreground">
          Ao criar a conta você concorda com os Termos de uso e a Política de privacidade (LGPD).
        </p>
      </form>
      <p className="mt-8 text-sm text-body">
        Já tem conta?{" "}
        <Link href="/entrar" className="text-ink underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </>
  );
}
