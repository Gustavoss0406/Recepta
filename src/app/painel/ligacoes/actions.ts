"use server";

import { apagarAudio } from "@/server/audio/armazenamento";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";

async function conversa(orgId: string, id: string) {
  const [c] = await getDb()
    .select()
    .from(schema.conversas)
    .where(and(eq(schema.conversas.orgId, orgId), eq(schema.conversas.id, id)));
  if (!c) throw new Error("Ligação não encontrada");
  return c;
}

export async function alternarSinalizada(id: string) {
  const s = await exigirPermissao("verLigacoes");
  const c = await conversa(s.org.id, id);
  await getDb().update(schema.conversas).set({ sinalizada: !c.sinalizada }).where(eq(schema.conversas.id, id));
  revalidatePath(`/painel/ligacoes/${id}`);
}

/** "Transformar em teste": the real call's opening becomes a simulation scenario. */
export async function transformarEmTeste(id: string, fd: FormData) {
  const s = await exigirPermissao("editarAgente");
  const c = await conversa(s.org.id, id);
  const turnos = await getDb()
    .select()
    .from(schema.turnos)
    .where(eq(schema.turnos.conversaId, id))
    .orderBy(asc(schema.turnos.ordem));
  const falas = turnos.filter((t) => t.papel === "cliente").map((t) => t.texto);
  const criterio = String(fd.get("criterio") ?? "").trim() || "A recepcionista resolve o pedido do cliente seguindo as regras da empresa, sem inventar informações.";
  const [caso] = await getDb()
    .insert(schema.casosTeste)
    .values({
      orgId: s.org.id,
      agenteId: c.agenteId,
      tipo: "simulacao",
      nome: `Caso real: ${(c.motivo ?? falas[0] ?? "ligação").slice(0, 60)}`,
      severidade: (String(fd.get("severidade") ?? "importante") as "importante"),
      origemConversaId: id,
      config: {
        persona: "Cliente real (reproduzido de uma ligação).",
        objetivo: falas.slice(0, 3).join(" ") || c.resumo || "Ligou para a empresa.",
        criterio,
        maxTurnos: 10,
        mockAgenda: "com_horarios",
      },
    })
    .returning();
  redirect(`/painel/testes?agente=${c.agenteId}&novo=${caso.id}`);
}

/** LGPD: erases the data subject's content from this call (transcript, extracted data, summary). */
export async function excluirDadosTitular(id: string) {
  const s = await exigirPermissao("configurarLgpd");
  const c = await conversa(s.org.id, id);
  const db = getDb();
  if (c.audioChave) await apagarAudio(c.audioChave);
  await db.update(schema.repasses).set({ contatoNome: null, contatoTelefone: null, dados: null, trecho: null }).where(eq(schema.repasses.conversaId, id));
  await db.update(schema.turnos).set({ texto: "[removido a pedido do titular]" }).where(eq(schema.turnos.conversaId, id));
  await db.update(schema.chamadasFerramenta).set({ args: null, resultado: null }).where(eq(schema.chamadasFerramenta.conversaId, id));
  await db
    .update(schema.conversas)
    .set({ de: null, resumo: "[removido a pedido do titular]", dados: null, estado: null, motivo: null, audioChave: null, audioPicos: null })
    .where(eq(schema.conversas.id, id));
  await db.insert(schema.auditoria).values({ orgId: s.org.id, usuarioId: s.usuario.id, acao: "lgpd.exclusao_titular", detalhes: { conversaId: id } });
  revalidatePath(`/painel/ligacoes/${id}`);
}
