import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { cifrar, decifrar } from "@/server/cripto";

const ESCOPOS = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy"];

export function googleConfigurado() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function urlConsentimento(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ESCOPOS.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface Tokens {
  access_token: string;
  refresh_token?: string;
  expira: number;
}

async function token(params: Record<string, string>): Promise<Tokens> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  if (!r.ok) throw new Error(`Google OAuth: ${r.status}`);
  const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return { access_token: j.access_token, refresh_token: j.refresh_token, expira: Date.now() + (j.expires_in - 60) * 1000 };
}

export async function conectarGoogle(orgId: string, code: string, redirectUri: string) {
  const t = await token({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  const db = getDb();
  await db.delete(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, "google_agenda")));
  await db.insert(schema.integracoes).values({ orgId, tipo: "google_agenda", status: "conectado", credenciais: cifrar(JSON.stringify(t)) });
}

async function acessoValido(orgId: string): Promise<string | null> {
  const db = getDb();
  const [i] = await db
    .select()
    .from(schema.integracoes)
    .where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, "google_agenda"), eq(schema.integracoes.status, "conectado")));
  if (!i?.credenciais) return null;
  let t = JSON.parse(decifrar(i.credenciais)) as Tokens;
  if (t.expira < Date.now()) {
    if (!t.refresh_token) return null;
    try {
      t = { ...(await token({ refresh_token: t.refresh_token, grant_type: "refresh_token" })), refresh_token: t.refresh_token };
      await db.update(schema.integracoes).set({ credenciais: cifrar(JSON.stringify(t)), atualizadoEm: new Date() }).where(eq(schema.integracoes.id, i.id));
    } catch {
      await db.update(schema.integracoes).set({ status: "erro" }).where(eq(schema.integracoes.id, i.id));
      return null;
    }
  }
  return t.access_token;
}

/** Busy intervals from the primary calendar (merged with the internal agenda by the caller). */
export async function ocupadosGoogle(orgId: string, de: Date, ate: Date): Promise<{ inicio: Date; fim: Date }[] | null> {
  const at = await acessoValido(orgId);
  if (!at) return null;
  const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { authorization: `Bearer ${at}`, "content-type": "application/json" },
    body: JSON.stringify({ timeMin: de.toISOString(), timeMax: ate.toISOString(), timeZone: "America/Sao_Paulo", items: [{ id: "primary" }] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { calendars?: { primary?: { busy?: { start: string; end: string }[] } } };
  return (j.calendars?.primary?.busy ?? []).map((b) => ({ inicio: new Date(b.start), fim: new Date(b.end) }));
}

export async function criarEventoGoogle(orgId: string, ev: { titulo: string; descricao: string; inicio: Date; fim: Date }) {
  const at = await acessoValido(orgId);
  if (!at) return null;
  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { authorization: `Bearer ${at}`, "content-type": "application/json" },
    body: JSON.stringify({
      summary: ev.titulo,
      description: ev.descricao,
      start: { dateTime: ev.inicio.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: ev.fim.toISOString(), timeZone: "America/Sao_Paulo" },
    }),
    signal: AbortSignal.timeout(8000),
  });
  return r.ok ? ((await r.json()) as { id: string }).id : null;
}
