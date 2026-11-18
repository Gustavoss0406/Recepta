"use client";

import Link from "next/link";
import { useActionState } from "react";
import { acaoEntrar } from "../actions";
import { BotaoEnviar, Campo, Erro } from "@/components/ui/form";

export default function EntrarPage() {
  const [estado, acao] = useActionState(acaoEntrar, undefined);
  return (
    <>
      <h1 className="display-section">Entrar</h1>
      <p className="mt-2 text-[0.9375rem] text-muted-foreground">Acesse o painel da sua empresa.</p>
      <form action={acao} className="mt-8 space-y-4">
        <Erro mensagem={estado?.erro} />
        <Campo label="E-mail" name="email" type="email" autoComplete="email" defaultValue={estado?.campos?.email} />
        <Campo label="Senha" name="senha" type="password" autoComplete="current-password" />
        <BotaoEnviar>Entrar</BotaoEnviar>
      </form>
      <p className="mt-8 text-sm text-body">
        Ainda não tem conta?{" "}
        <Link href="/criar-conta" className="text-ink underline underline-offset-4">
          Teste grátis
        </Link>
      </p>
    </>
  );
}
