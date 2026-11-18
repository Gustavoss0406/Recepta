import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { cifrar, decifrar } from "@/server/cripto";
import { conector } from "@/lib/integracoes/catalogo";
import { ADAPTADORES, ErroConector, SINCRONIZAM, whatsapp, type Credenciais, type Evento } from "./conectores";
import "./oauth"; // registers the OAuth adapters (Salesforce, HubSpot/Pipedrive sign-in)
import { enviarGmail } from "./google"; // also registers the Google adapter

export interface Historico {
  quando: string;
  evento: Evento["tipo"];
  ok: boolean;
  detalhe: string;
}
export interface Detalhes {
  conta?: string;
  /** Google: permissions granted (agenda, planilhas, gmail). */
  permissoes?: string[];
  conectadoEm?: string;
  historico?: Historico[];
}

const MAX_TENTATIVAS = 5;

async function linha(orgId: string, id: string) {
  const [i] = await getDb()
    .select()
    .from(schema.integracoes)
    .where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, id)));
  return i ?? null;
}

export async function credenciaisDe(orgId: string, id: string): Promise<Credenciais | null> {
  const i = await linha(orgId, id);
  return i?.status === "conectado" && i.credenciais ? (JSON.parse(decifrar(i.credenciais)) as Credenciais) : null;
}

/** Validates the credential with the vendor before saving it (encrypted). */
export async function conectar(orgId: string, id: string, campos: Credenciais) {
  const c = conector(id);
  const a = ADAPTADORES[id];
  if (!c || !a || c.auth === "oauth") throw new ErroConector("Integração não disponível para conexão por chave");
  const cred: Credenciais = {};
  for (const f of c.campos ?? []) {
    const v = (campos[f.nome] ?? "").trim();
    if (!v) throw new ErroConector(`Preencha: ${f.rotulo}`);
    cred[f.nome] = v;
  }
  const conta = await a.testar(cred);
  const db = getDb();
  await db.delete(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, id)));
  await db.insert(schema.integracoes).values({
    orgId,
    tipo: id,
    status: "conectado",
    credenciais: cifrar(JSON.stringify(cred)),
    detalhes: { conta, conectadoEm: new Date().toISOString(), historico: [] } satisfies Detalhes,
  });
  return conta;
}

export async function desconectar(orgId: string, id: string) {
  await getDb().delete(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, id)));
}

export async function testarConexao(orgId: string, id: string) {
  const cred = await credenciaisDe(orgId, id);
  const a = ADAPTADORES[id];
  if (!cred || !a) throw new ErroConector("Integração não conectada");
  try {
    const conta = await a.testar(cred);
    // testar may create settings (e.g. the Google Sheets spreadsheet id): keep them.
    await getDb()
      .update(schema.integracoes)
      .set({ credenciais: cifrar(JSON.stringify(cred)), status: "conectado", atualizadoEm: new Date() })
      .where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, id)));
    return conta;
  } catch (e) {
    if (e instanceof ErroConector && (e.status === 401 || e.status === 403))
      await getDb().update(schema.integracoes).set({ status: "erro", atualizadoEm: new Date() }).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, id)));
    throw e;
  }
}

/** Queues one delivery per connected connector that receives events (worker sends with retries). */
export async function agendarSincronizacao(orgId: string, evento: Evento) {
  const db = getDb();
  const ativas = await db
    .select({ id: schema.integracoes.id, tipo: schema.integracoes.tipo })
    .from(schema.integracoes)
    .where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.status, "conectado")));
  for (const i of ativas.filter((x) => SINCRONIZAM.includes(x.tipo) && ADAPTADORES[x.tipo]))
    await db.insert(schema.jobs).values({ tipo: "integracao.sincronizar", payload: { integracaoId: i.id, evento } });
}

async function registrar(integracaoId: string, h: Historico) {
  const db = getDb();
  const [i] = await db.select({ detalhes: schema.integracoes.detalhes }).from(schema.integracoes).where(eq(schema.integracoes.id, integracaoId));
  const d = (i?.detalhes ?? {}) as Detalhes;
  await db
    .update(schema.integracoes)
    .set({ detalhes: { ...d, historico: [h, ...(d.historico ?? [])].slice(0, 15) }, atualizadoEm: new Date() })
    .where(eq(schema.integracoes.id, integracaoId));
}

/** Worker job: sends one event; transient failures are re-queued with exponential backoff. */
export async function executarSincronizacao(p: { integracaoId: string; evento: Evento; tentativa?: number }) {
  const db = getDb();
  const [i] = await db.select().from(schema.integracoes).where(eq(schema.integracoes.id, p.integracaoId));
  if (!i || i.status !== "conectado" || !i.credenciais) return;
  const a = ADAPTADORES[i.tipo];
  if (!a) return;
  const quando = new Date().toISOString();
  try {
    const original = decifrar(i.credenciais);
    const cred = JSON.parse(original) as Credenciais;
    const ref = await a.enviar(cred, p.evento);
    // OAuth adapters refresh tokens (and may create settings) in place: keep them
    if (JSON.stringify(cred) !== original) await db.update(schema.integracoes).set({ credenciais: cifrar(JSON.stringify(cred)) }).where(eq(schema.integracoes.id, i.id));
    await registrar(i.id, { quando, evento: p.evento.tipo, ok: true, detalhe: ref });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const tentativa = (p.tentativa ?? 0) + 1;
    const credencial = e instanceof ErroConector && (e.status === 401 || e.status === 403);
    await registrar(i.id, { quando, evento: p.evento.tipo, ok: false, detalhe: msg.slice(0, 200) });
    if (credencial) await db.update(schema.integracoes).set({ status: "erro" }).where(eq(schema.integracoes.id, i.id));
    else if (tentativa < MAX_TENTATIVAS)
      await db.insert(schema.jobs).values({ tipo: "integracao.sincronizar", payload: { ...p, tentativa }, executarEm: new Date(Date.now() + 2 ** tentativa * 30_000) });
  }
}

/** Real WhatsApp delivery when the customer connected the Cloud API; otherwise null (stays simulated). */
export async function enviarWhatsAppReal(orgId: string, para: string, texto: string): Promise<string | null> {
  const cred = await credenciaisDe(orgId, "whatsapp");
  if (!cred) return null;
  return whatsapp.mensagem(cred, para, texto);
}

/**
 * Outbox: records every outgoing message and delivers it through the customer's own channels:
 * WhatsApp Cloud API, or e-mail from their Gmail (Google › Gmail permission). Without a
 * connection it stays "simulado".
 */
export async function enviarSaida(orgId: string, m: { canal: "whatsapp" | "email"; destino: string; corpo: string; assunto?: string }, opts: { real?: boolean } = {}) {
  const db = getDb();
  const [linha] = await db.insert(schema.caixaSaida).values({ orgId, ...m, status: "simulado" }).returning();
  if (opts.real === false || !m.destino) return linha;
  try {
    const id =
      m.canal === "whatsapp"
        ? await enviarWhatsAppReal(orgId, m.destino, m.corpo)
        : await enviarGmail(orgId, m.destino, m.assunto ?? "Recepta", m.corpo);
    if (id) await db.update(schema.caixaSaida).set({ status: "enviado" }).where(eq(schema.caixaSaida.id, linha.id));
  } catch {
    await db.update(schema.caixaSaida).set({ status: "erro" }).where(eq(schema.caixaSaida.id, linha.id));
  }
  return linha;
}
