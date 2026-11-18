"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Papel } from "@/db/schema";
import { exigirPermissao } from "@/server/auth/session";
import { novoToken, sha256 } from "@/server/auth/tokens";

export type R = { ok?: boolean; erro?: string; mensagem?: string } | undefined;
const PAPEIS: Papel[] = ["dono", "gestor", "atendente", "financeiro"];

export async function convidar(_: R, fd: FormData): Promise<R> {
  const s = await exigirPermissao("gerenciarEquipe");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const papel = String(fd.get("papel")) as Papel;
  if (!email.includes("@") || !PAPEIS.includes(papel)) return { erro: "Informe e-mail e papel." };
  const token = novoToken();
  const db = getDb();
  await db.insert(schema.convites).values({ id: sha256(token), orgId: s.org.id, email, papel, expiraEm: new Date(Date.now() + 7 * 86_400_000) });
  const link = `${process.env.RECEPTA_URL_PUBLICA ?? ""}/convite/${token}`;
  await db.insert(schema.caixaSaida).values({ orgId: s.org.id, canal: "email", destino: email, assunto: `Convite para ${s.org.nome} na Recepta`, corpo: `Você foi convidado como ${papel}. Aceite em: ${link}` });
  revalidatePath("/painel/configuracoes");
  return { ok: true, mensagem: `Convite enviado. Link (válido por 7 dias): ${link}` };
}

export async function alterarPapel(usuarioId: string, fd: FormData) {
  const s = await exigirPermissao("gerenciarEquipe");
  const papel = String(fd.get("papel")) as Papel;
  if (!PAPEIS.includes(papel) || usuarioId === s.usuario.id) return;
  await getDb().update(schema.membros).set({ papel }).where(and(eq(schema.membros.orgId, s.org.id), eq(schema.membros.usuarioId, usuarioId)));
  revalidatePath("/painel/configuracoes");
}

export async function removerMembro(usuarioId: string) {
  const s = await exigirPermissao("gerenciarEquipe");
  if (usuarioId === s.usuario.id) return;
  await getDb().delete(schema.membros).where(and(eq(schema.membros.orgId, s.org.id), eq(schema.membros.usuarioId, usuarioId)));
  revalidatePath("/painel/configuracoes");
}

export async function salvarLgpd(_: R, fd: FormData): Promise<R> {
  const s = await exigirPermissao("configurarLgpd");
  const audio = Math.min(Math.max(Number(fd.get("audio") ?? 90), 1), 3650);
  const transc = Math.min(Math.max(Number(fd.get("transcricao") ?? 365), 1), 3650);
  await getDb()
    .update(schema.organizacoes)
    .set({ retencaoAudioDias: audio, retencaoTranscricaoDias: transc, mascararDados: fd.get("mascarar") === "on" })
    .where(eq(schema.organizacoes.id, s.org.id));
  await getDb().insert(schema.auditoria).values({ orgId: s.org.id, usuarioId: s.usuario.id, acao: "lgpd.retencao_alterada", detalhes: { audio, transc } });
  revalidatePath("/painel/configuracoes");
  return { ok: true, mensagem: "Política salva" };
}

export async function criarChaveApi(_: R, fd: FormData): Promise<R> {
  const s = await exigirPermissao("integracoes");
  const segredo = novoToken(32);
  const prefixo = `rk_${novoToken(6)}`;
  await getDb().insert(schema.chavesApi).values({ orgId: s.org.id, nome: String(fd.get("nome") ?? "Chave") || "Chave", prefixo, hash: sha256(segredo) });
  revalidatePath("/painel/configuracoes");
  return { ok: true, mensagem: `${prefixo}.${segredo}` };
}

export async function revogarChave(id: string) {
  const s = await exigirPermissao("integracoes");
  await getDb().update(schema.chavesApi).set({ revogadaEm: new Date() }).where(and(eq(schema.chavesApi.orgId, s.org.id), eq(schema.chavesApi.id, id)));
  revalidatePath("/painel/configuracoes");
}
