import "server-only";
import { and, eq, gt, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { finalTelefone } from "@/server/integracoes/conectores";
import { agendaGoogleConectada, excluirEventoGoogle, listarMudancasGoogle, salvarEventoGoogle } from "@/server/integracoes/google";

/**
 * Internal agenda — the source of truth. Booking always works; Google Calendar (when connected)
 * is mirrored both ways in the background: our changes are queued with retries, and changes made
 * in Google are imported every few minutes (incremental sync token).
 */
export type Evento = typeof schema.agendaEventos.$inferSelect;

export class ErroAgenda extends Error {}

const ev = schema.agendaEventos;
const MAX_TENTATIVAS = 6;

export interface DadosEvento {
  inicio: Date;
  fim: Date;
  titulo: string;
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  observacao?: string | null;
  agenteId?: string | null;
  conversaId?: string | null;
}

/** Confirmed events overlapping [inicio, fim) — imported Google events block slots too. */
export async function conflitos(orgId: string, inicio: Date, fim: Date, opts: { exceto?: string; incluirSimulados?: boolean } = {}) {
  return getDb()
    .select({ id: ev.id, titulo: ev.titulo, inicio: ev.inicio })
    .from(ev)
    .where(
      and(
        eq(ev.orgId, orgId),
        eq(ev.status, "confirmado"),
        lt(ev.inicio, fim),
        gt(ev.fim, inicio),
        ...(opts.exceto ? [ne(ev.id, opts.exceto)] : []),
        ...(opts.incluirSimulados ? [] : [eq(ev.simulado, false)]),
      ),
    )
    .limit(3);
}

async function enfileirar(eventoId: string, tentativa = 0, atrasoMs = 0) {
  await getDb()
    .insert(schema.jobs)
    .values({ tipo: "agenda.sincronizar", payload: { eventoId, tentativa }, ...(atrasoMs ? { executarEm: new Date(Date.now() + atrasoMs) } : {}) });
}

function validar(d: DadosEvento) {
  if (Number.isNaN(d.inicio.getTime()) || Number.isNaN(d.fim.getTime())) throw new ErroAgenda("Data ou horário inválido");
  if (d.fim <= d.inicio) throw new ErroAgenda("O fim precisa ser depois do início");
  if (d.fim.getTime() - d.inicio.getTime() > 12 * 3_600_000) throw new ErroAgenda("Evento com mais de 12 horas");
  if (!d.titulo.trim()) throw new ErroAgenda("Dê um título ao evento");
}

export async function criarEvento(
  orgId: string,
  d: DadosEvento,
  opts: { origem?: "recepcionista" | "manual"; simulado?: boolean; permitirConflito?: boolean } = {},
): Promise<Evento> {
  validar(d);
  if (!opts.permitirConflito && (await conflitos(orgId, d.inicio, d.fim, { incluirSimulados: opts.simulado })).length) throw new ErroAgenda("horario_ocupado");
  const google = !opts.simulado && (await agendaGoogleConectada(orgId).catch(() => false));
  const [e] = await getDb()
    .insert(ev)
    .values({
      orgId,
      agenteId: d.agenteId ?? null,
      conversaId: d.conversaId ?? null,
      inicio: d.inicio,
      fim: d.fim,
      titulo: d.titulo.trim().slice(0, 200),
      clienteNome: d.clienteNome?.trim() || null,
      clienteTelefone: d.clienteTelefone?.trim() || null,
      observacao: d.observacao?.trim() || null,
      simulado: Boolean(opts.simulado),
      origem: opts.origem ?? "recepcionista",
      sincronia: google ? "pendente" : "local",
      atualizadoEm: new Date(),
    })
    .returning();
  if (google) await enfileirar(e.id);
  return e;
}

async function doOrg(orgId: string, id: string) {
  const [e] = await getDb().select().from(ev).where(and(eq(ev.orgId, orgId), eq(ev.id, id)));
  if (!e) throw new ErroAgenda("Agendamento não encontrado");
  return e;
}

export async function atualizarEvento(orgId: string, id: string, patch: Partial<DadosEvento>, opts: { permitirConflito?: boolean } = {}): Promise<Evento> {
  const atual = await doOrg(orgId, id);
  if (atual.status === "cancelado") throw new ErroAgenda("Este agendamento foi cancelado");
  const novo: DadosEvento = {
    inicio: patch.inicio ?? atual.inicio,
    fim: patch.fim ?? (patch.inicio ? new Date(patch.inicio.getTime() + (atual.fim.getTime() - atual.inicio.getTime())) : atual.fim),
    titulo: patch.titulo ?? atual.titulo,
    clienteNome: patch.clienteNome !== undefined ? patch.clienteNome : atual.clienteNome,
    clienteTelefone: patch.clienteTelefone !== undefined ? patch.clienteTelefone : atual.clienteTelefone,
    observacao: patch.observacao !== undefined ? patch.observacao : atual.observacao,
  };
  validar(novo);
  if (!opts.permitirConflito && (await conflitos(orgId, novo.inicio, novo.fim, { exceto: id, incluirSimulados: atual.simulado })).length) throw new ErroAgenda("horario_ocupado");
  const google = !atual.simulado && (atual.googleId || (await agendaGoogleConectada(orgId).catch(() => false)));
  const [e] = await getDb()
    .update(ev)
    .set({ ...novo, ...(google ? { sincronia: "pendente" as const } : {}), atualizadoEm: new Date() })
    .where(eq(ev.id, id))
    .returning();
  if (google) await enfileirar(id);
  return e;
}

export async function cancelarEvento(orgId: string, id: string): Promise<Evento> {
  const atual = await doOrg(orgId, id);
  const [e] = await getDb()
    .update(ev)
    .set({ status: "cancelado", ...(atual.googleId ? { sincronia: "pendente" as const } : {}), atualizadoEm: new Date() })
    .where(eq(ev.id, id))
    .returning();
  if (atual.googleId) await enfileirar(id);
  return e;
}

/** Upcoming appointments of a caller (by the last 8 digits of the phone). */
export async function agendamentosDoCliente(orgId: string, telefone: string | null | undefined, opts: { incluirSimulados?: boolean } = {}) {
  const fim = finalTelefone(telefone);
  if (fim.length < 8) return [];
  return getDb()
    .select({ id: ev.id, titulo: ev.titulo, inicio: ev.inicio, fim: ev.fim, clienteNome: ev.clienteNome })
    .from(ev)
    .where(
      and(
        eq(ev.orgId, orgId),
        eq(ev.status, "confirmado"),
        gte(ev.inicio, new Date()),
        sql`right(regexp_replace(coalesce(${ev.clienteTelefone}, ''), '\\D', '', 'g'), 8) = ${fim}`,
        ...(opts.incluirSimulados ? [] : [eq(ev.simulado, false)]),
      ),
    )
    .orderBy(ev.inicio)
    .limit(5);
}

export async function eventosDoPeriodo(orgId: string, de: Date, ate: Date) {
  return getDb()
    .select()
    .from(ev)
    .where(and(eq(ev.orgId, orgId), eq(ev.simulado, false), lt(ev.inicio, ate), gt(ev.fim, de)))
    .orderBy(ev.inicio);
}

const descricao = (e: Evento) =>
  [e.clienteNome && `Cliente: ${e.clienteNome}`, e.clienteTelefone && `Telefone: ${e.clienteTelefone}`, e.observacao, "Agendado pela Recepta."].filter(Boolean).join("\n");

/** Worker job: pushes one event to Google; transient failures are retried with backoff. */
export async function sincronizarEvento(p: { eventoId: string; tentativa?: number }) {
  const db = getDb();
  const [e] = await db.select().from(ev).where(eq(ev.id, p.eventoId));
  if (!e || e.simulado || e.origem === "google") return;
  try {
    if (e.status === "cancelado") {
      if (e.googleId) await excluirEventoGoogle(e.orgId, e.googleId);
    } else {
      const titulo = e.clienteNome ? `${e.titulo} · ${e.clienteNome}` : e.titulo;
      const googleId = await salvarEventoGoogle(e.orgId, e.googleId, { titulo, descricao: descricao(e), inicio: e.inicio, fim: e.fim, receptaId: e.id });
      if (googleId !== e.googleId) await db.update(ev).set({ googleId }).where(eq(ev.id, e.id));
    }
    await db.update(ev).set({ sincronia: "ok", sincronizadoEm: new Date() }).where(eq(ev.id, e.id));
  } catch (err) {
    const tentativa = (p.tentativa ?? 0) + 1;
    await db.update(ev).set({ sincronia: tentativa >= MAX_TENTATIVAS ? "erro" : "pendente" }).where(eq(ev.id, e.id));
    if (tentativa < MAX_TENTATIVAS) await enfileirar(e.id, tentativa, 2 ** tentativa * 30_000);
    else console.error(`[agenda] evento ${e.id} não sincronizou com o Google:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Imports changes made in Google: events created there block the slot here, events moved or
 * deleted there are moved or cancelled here (including the ones the receptionist created).
 */
export async function importarGoogle(orgId: string): Promise<{ importados: number; atualizados: number; cancelados: number }> {
  const db = getDb();
  const [linha] = await db
    .select()
    .from(schema.integracoes)
    .where(and(eq(schema.integracoes.orgId, orgId), inArray(schema.integracoes.tipo, ["google", "google_agenda"]), eq(schema.integracoes.status, "conectado")));
  if (!linha || !(await agendaGoogleConectada(orgId))) return { importados: 0, atualizados: 0, cancelados: 0 };
  const detalhes = (linha.detalhes ?? {}) as Record<string, unknown>;
  const { eventos, syncToken } = await listarMudancasGoogle(orgId, (detalhes.agendaSyncToken as string) ?? null);
  const r = { importados: 0, atualizados: 0, cancelados: 0 };
  for (const g of eventos) {
    const [local] = await db
      .select()
      .from(ev)
      .where(and(eq(ev.orgId, orgId), g.receptaId ? eq(ev.id, g.receptaId) : eq(ev.googleId, g.id)))
      .limit(1);
    if (g.cancelado) {
      if (local && local.status !== "cancelado") {
        await db.update(ev).set({ status: "cancelado", sincronia: "ok", sincronizadoEm: new Date(), atualizadoEm: new Date() }).where(eq(ev.id, local.id));
        r.cancelados++;
      }
      continue;
    }
    if (!g.inicio || !g.fim) continue;
    if (local) {
      // a pending local change wins (it will be pushed); otherwise accept the move made in Google
      if (local.sincronia === "pendente") continue;
      if (local.inicio.getTime() !== g.inicio.getTime() || local.fim.getTime() !== g.fim.getTime() || (local.origem === "google" && local.titulo !== g.titulo)) {
        await db
          .update(ev)
          .set({ inicio: g.inicio, fim: g.fim, ...(local.origem === "google" ? { titulo: g.titulo } : {}), googleId: g.id, sincronia: "ok", sincronizadoEm: new Date(), atualizadoEm: new Date() })
          .where(eq(ev.id, local.id));
        r.atualizados++;
      }
    } else {
      await db.insert(ev).values({ orgId, inicio: g.inicio, fim: g.fim, titulo: g.titulo.slice(0, 200), origem: "google", googleId: g.id, sincronia: "ok", sincronizadoEm: new Date(), atualizadoEm: new Date() });
      r.importados++;
    }
  }
  await db
    .update(schema.integracoes)
    .set({ detalhes: { ...detalhes, agendaSyncToken: syncToken, agendaImportadaEm: new Date().toISOString() } })
    .where(eq(schema.integracoes.id, linha.id));
  return r;
}

/** Worker: every org with Google Agenda connected. */
export async function importarTodasAgendas() {
  const orgs = await getDb()
    .selectDistinct({ orgId: schema.integracoes.orgId })
    .from(schema.integracoes)
    .where(and(inArray(schema.integracoes.tipo, ["google", "google_agenda"]), eq(schema.integracoes.status, "conectado")));
  let total = 0;
  for (const { orgId } of orgs)
    try {
      const r = await importarGoogle(orgId);
      total += r.importados + r.atualizados + r.cancelados;
    } catch (e) {
      console.error(`[agenda] importação do Google falhou (${orgId}):`, e instanceof Error ? e.message : e);
    }
  return total;
}
