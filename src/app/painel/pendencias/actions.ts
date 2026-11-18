"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";
import { criarRepasse } from "@/server/agent/repasses";

const STATUS = ["pendente", "em_andamento", "resolvido"] as const;
type Status = (typeof STATUS)[number];

async function membroDaOrg(orgId: string, usuarioId: string) {
  const [m] = await getDb()
    .select({ id: schema.membros.usuarioId })
    .from(schema.membros)
    .where(and(eq(schema.membros.orgId, orgId), eq(schema.membros.usuarioId, usuarioId)));
  return Boolean(m);
}

export async function acaoMudarStatusRepasse(id: string, status: Status) {
  const s = await exigirPermissao("verLigacoes");
  if (!STATUS.includes(status)) throw new Error("Status inválido");
  await getDb()
    .update(schema.repasses)
    .set({
      status,
      resolvidoEm: status === "resolvido" ? new Date() : null,
      // Picking a case up without an owner assigns it to whoever picked it up.
      ...(status === "em_andamento" ? { responsavelId: s.usuario.id } : {}),
    })
    .where(and(eq(schema.repasses.orgId, s.org.id), eq(schema.repasses.id, id)));
  revalidatePath("/painel/pendencias");
  revalidatePath(`/painel/pendencias/${id}`);
}

export async function acaoAtualizarRepasse(id: string, fd: FormData) {
  const s = await exigirPermissao("verLigacoes");
  const resp = String(fd.get("responsavel") ?? "");
  if (resp && !(await membroDaOrg(s.org.id, resp))) throw new Error("Responsável inválido");
  await getDb()
    .update(schema.repasses)
    .set({ responsavelId: resp || null, nota: String(fd.get("nota") ?? "").slice(0, 4000) || null })
    .where(and(eq(schema.repasses.orgId, s.org.id), eq(schema.repasses.id, id)));
  revalidatePath(`/painel/pendencias/${id}`);
  revalidatePath("/painel/pendencias");
}

export async function acaoNovoRepasse(fd: FormData) {
  const s = await exigirPermissao("verLigacoes");
  const pedido = String(fd.get("pedido") ?? "").trim();
  if (pedido.length < 3) redirect("/painel/pendencias?novo=1&erro=1");
  const urg = String(fd.get("urgencia") ?? "media");
  const rep = await criarRepasse({
    orgId: s.org.id,
    agenteId: null,
    conversaId: null,
    motivo: String(fd.get("motivo") ?? "").trim() || "Criado pela equipe",
    pedido,
    urgencia: (["baixa", "media", "alta"].includes(urg) ? urg : "media") as "baixa" | "media" | "alta",
    contatoNome: String(fd.get("nome") ?? "") || null,
    contatoTelefone: String(fd.get("telefone") ?? "") || null,
    origem: "manual",
    notificar: "nenhum",
  });
  redirect(`/painel/pendencias/${rep.id}`);
}
