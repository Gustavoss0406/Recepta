import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { emitirEvento } from "@/server/integracoes/eventos";
import { agendarSincronizacao, enviarSaida } from "@/server/integracoes/servico";

export type Urgencia = "baixa" | "media" | "alta";

export interface NovoRepasse {
  orgId: string;
  agenteId: string | null;
  conversaId: string | null;
  motivo: string;
  pedido: string;
  urgencia?: Urgencia;
  proximoPasso?: string | null;
  contatoNome?: string | null;
  contatoTelefone?: string | null;
  dados?: Record<string, string>;
  origem: "agente" | "automatico" | "teste" | "manual";
  notificar?: "whatsapp" | "email" | "ambos" | "nenhum";
}

const URG: Record<Urgencia, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };

function tituloDe(pedido: string, nome?: string | null): string {
  const base = pedido.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  const cap = base.charAt(0).toUpperCase() + base.slice(1);
  const curto = cap.length > 72 ? `${cap.slice(0, 70).trimEnd()}…` : cap;
  return nome ? `${nome}: ${curto}` : curto || "Caso para a equipe";
}

/** The last exchanges of the call, so whoever picks the case up has the context without opening the transcript. */
async function trechoDaConversa(conversaId: string | null): Promise<string | null> {
  if (!conversaId) return null;
  const turnos = await getDb()
    .select({ papel: schema.turnos.papel, texto: schema.turnos.texto })
    .from(schema.turnos)
    .where(eq(schema.turnos.conversaId, conversaId))
    .orderBy(asc(schema.turnos.ordem));
  const falas = turnos.filter((t) => t.papel === "cliente" || t.papel === "agente").slice(-6);
  return falas.length ? falas.map((t) => `${t.papel === "cliente" ? "Cliente" : "Recepcionista"}: ${t.texto}`).join("\n") : null;
}

/**
 * Creates the hand-off report (Pendências inbox), notifies the owner through the outbox and emits `handoff.created`.
 * Test conversations create the report too (so the owner can see what would happen) but never notify anyone.
 */
export async function criarRepasse(r: NovoRepasse) {
  const db = getDb();
  const [rep] = await db
    .insert(schema.repasses)
    .values({
      orgId: r.orgId,
      agenteId: r.agenteId,
      conversaId: r.conversaId,
      titulo: tituloDe(r.pedido, r.contatoNome),
      motivo: r.motivo.trim() || "Sem motivo informado",
      pedido: r.pedido.trim() || "Não informado",
      urgencia: r.urgencia ?? "media",
      proximoPasso: r.proximoPasso?.trim() || null,
      contatoNome: r.contatoNome?.trim() || null,
      contatoTelefone: r.contatoTelefone?.trim() || null,
      dados: r.dados && Object.keys(r.dados).length ? r.dados : null,
      trecho: await trechoDaConversa(r.conversaId),
      origem: r.origem,
    })
    .returning();

  if (r.conversaId) await db.update(schema.conversas).set({ sinalizada: true }).where(eq(schema.conversas.id, r.conversaId));
  if (r.origem === "teste") return rep;

  const notificar = r.notificar ?? "ambos";
  if (notificar !== "nenhum") {
    const [org] = await db.select().from(schema.organizacoes).where(eq(schema.organizacoes.id, r.orgId));
    const donos = await db
      .select({ email: schema.usuarios.email })
      .from(schema.membros)
      .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.membros.usuarioId))
      .where(and(eq(schema.membros.orgId, r.orgId), eq(schema.membros.papel, "dono")));
    const corpo = [
      `Novo caso para a equipe (${URG[rep.urgencia]} urgência)`,
      `Cliente: ${rep.contatoNome ?? "não informado"}${rep.contatoTelefone ? ` · ${rep.contatoTelefone}` : ""}`,
      `Quer: ${rep.pedido}`,
      `Por que veio para vocês: ${rep.motivo}`,
      rep.proximoPasso ? `Próximo passo sugerido: ${rep.proximoPasso}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if ((notificar === "whatsapp" || notificar === "ambos") && org?.telefoneContato)
      await enviarSaida(r.orgId, { canal: "whatsapp", destino: org.telefoneContato, corpo });
    if (notificar === "email" || notificar === "ambos")
      for (const d of donos)
        await enviarSaida(r.orgId, { canal: "email", destino: d.email, assunto: `Pendência: ${rep.titulo}`, corpo });
  }
  await agendarSincronizacao(r.orgId, {
    tipo: "repasse.criado",
    titulo: rep.titulo,
    texto: [`O que o cliente quer: ${rep.pedido}`, `Por que veio para a equipe: ${rep.motivo}`, rep.proximoPasso ? `Próximo passo: ${rep.proximoPasso}` : ""].filter(Boolean).join("\n"),
    contato: { nome: rep.contatoNome, telefone: rep.contatoTelefone },
    urgencia: rep.urgencia,
    quando: rep.criadoEm.toISOString(),
    dados: rep.dados ?? undefined,
    link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/painel/pendencias/${rep.id}`,
  });
  await emitirEvento(r.orgId, "handoff.created", {
    id: rep.id,
    conversaId: rep.conversaId,
    agenteId: rep.agenteId,
    titulo: rep.titulo,
    motivo: rep.motivo,
    pedido: rep.pedido,
    urgencia: rep.urgencia,
    proximoPasso: rep.proximoPasso,
    contato: { nome: rep.contatoNome, telefone: rep.contatoTelefone },
    origem: rep.origem,
  });
  return rep;
}
