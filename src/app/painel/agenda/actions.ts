"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/auth/session";
import { atualizarEvento, cancelarEvento, criarEvento, ErroAgenda } from "@/server/agenda/agenda";

export type R = { ok?: boolean; erro?: string } | undefined;

/** Brazil has no daylight saving since 2019: wall-clock times are UTC-3. */
const quando = (data: string, hora: string) => new Date(`${data}T${hora}:00-03:00`);

const mensagem = (e: unknown) =>
  e instanceof ErroAgenda ? (e.message === "horario_ocupado" ? "Já existe um compromisso nesse horário." : e.message) : "Não foi possível salvar. Tente de novo.";

export async function salvarEvento(_: R, fd: FormData): Promise<R> {
  const s = await exigirSessao();
  const g = (k: string) => String(fd.get(k) ?? "").trim();
  const inicio = quando(g("data"), g("inicio"));
  const fim = new Date(inicio.getTime() + Math.max(5, Number(g("duracao")) || 30) * 60_000);
  const dados = { inicio, fim, titulo: g("titulo"), clienteNome: g("clienteNome"), clienteTelefone: g("clienteTelefone"), observacao: g("observacao") };
  try {
    if (g("id")) await atualizarEvento(s.org.id, g("id"), dados, { permitirConflito: g("forcar") === "1" });
    else await criarEvento(s.org.id, dados, { origem: "manual", permitirConflito: g("forcar") === "1" });
  } catch (e) {
    return { erro: mensagem(e) };
  }
  revalidatePath("/painel/agenda");
  return { ok: true };
}

export async function cancelar(id: string): Promise<R> {
  const s = await exigirSessao();
  try {
    await cancelarEvento(s.org.id, id);
  } catch (e) {
    return { erro: mensagem(e) };
  }
  revalidatePath("/painel/agenda");
  return { ok: true };
}
