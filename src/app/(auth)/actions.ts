"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { autenticar, criarConta, ErroConta } from "@/server/auth/conta";
import { criarSessao, encerrarSessao } from "@/server/auth/session";

export type EstadoForm = { erro?: string; campos?: Record<string, string> } | undefined;

function valores(form: FormData) {
  return Object.fromEntries([...form.entries()].filter(([k]) => k !== "senha").map(([k, v]) => [k, String(v)]));
}

export async function acaoCriarConta(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  try {
    const { usuarioId, orgId } = await criarConta({
      nome: String(form.get("nome") ?? ""),
      email: String(form.get("email") ?? ""),
      senha: String(form.get("senha") ?? ""),
      empresa: String(form.get("empresa") ?? ""),
      nicho: String(form.get("nicho") ?? "") as "clinica",
    });
    await criarSessao(usuarioId, orgId);
  } catch (e) {
    if (e instanceof ZodError) return { erro: e.issues[0]?.message ?? "Dados inválidos", campos: valores(form) };
    if (e instanceof ErroConta) return { erro: e.message, campos: valores(form) };
    throw e;
  }
  redirect("/painel/comecar");
}

export async function acaoEntrar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  try {
    const { usuarioId, orgId } = await autenticar(String(form.get("email") ?? ""), String(form.get("senha") ?? ""));
    await criarSessao(usuarioId, orgId);
  } catch (e) {
    if (e instanceof ErroConta) return { erro: e.message, campos: valores(form) };
    throw e;
  }
  redirect("/painel");
}

export async function acaoSair() {
  await encerrarSessao();
  redirect("/entrar");
}
