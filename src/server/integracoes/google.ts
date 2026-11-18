import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { cifrar, decifrar } from "@/server/cripto";
import { ESCOPOS_BASE, PERMISSOES_GOOGLE, permissoesDe, type PermissaoGoogle } from "@/lib/integracoes/google-permissoes";
import { ErroConector, registrarAdaptador, type Adaptador, type Credenciais, type Evento } from "./conectores";
import { acesso, trocarCodigoOAuth } from "./oauth";

/**
 * Google: one connection ("google") with incremental permissions — Agenda (free/busy + events),
 * Planilhas (a spreadsheet the app creates; drive.file only) and Gmail (send only).
 * Legacy "google_agenda" rows keep working for the calendar.
 */

export function googleConfigurado() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function urlConsentimento(redirectUri: string, state: string, permissoes: PermissaoGoogle[]) {
  const escopos = [...ESCOPOS_BASE, ...permissoes.flatMap((p) => PERMISSOES_GOOGLE[p].escopos)];
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: escopos.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokensGoogle {
  access_token: string;
  refresh_token?: string;
  expira: number;
  escopos?: string[];
  planilhaId?: string;
  email?: string;
}

/** E-mail from the id_token (received directly from Google's token endpoint over TLS). */
function emailDoIdToken(idToken?: string): string | undefined {
  try {
    return JSON.parse(Buffer.from(idToken!.split(".")[1], "base64url").toString()).email;
  } catch {
    return undefined;
  }
}

async function linhaGoogle(orgId: string) {
  const linhas = await getDb()
    .select()
    .from(schema.integracoes)
    .where(and(eq(schema.integracoes.orgId, orgId), inArray(schema.integracoes.tipo, ["google", "google_agenda"])));
  return linhas.find((l) => l.tipo === "google") ?? linhas[0] ?? null;
}

export async function conectarGoogle(orgId: string, code: string, redirectUri: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, code, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Google OAuth: ${r.status}`);
  const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string; id_token?: string };
  const anterior = await linhaGoogle(orgId);
  const antes = anterior?.credenciais ? (JSON.parse(decifrar(anterior.credenciais)) as TokensGoogle) : null;
  const escopos = (j.scope ?? "").split(" ").filter(Boolean);
  const t: TokensGoogle = {
    ...antes,
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? antes?.refresh_token,
    expira: Date.now() + (j.expires_in - 60) * 1000,
    escopos: [...new Set([...(antes?.escopos ?? []), ...escopos])],
    email: emailDoIdToken(j.id_token) ?? antes?.email,
  };
  const db = getDb();
  await db.delete(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), inArray(schema.integracoes.tipo, ["google", "google_agenda", "google_sheets"])));
  await db.insert(schema.integracoes).values({
    orgId,
    tipo: "google",
    status: "conectado",
    credenciais: cifrar(JSON.stringify(t)),
    detalhes: { conta: t.email ?? "Conta Google", conectadoEm: new Date().toISOString(), historico: [], permissoes: permissoesDe(t.escopos) },
  });
  return permissoesDe(t.escopos);
}

/** Valid access token when the org granted `permissao` (refreshed and re-saved when expired). */
async function acessoCom(orgId: string, permissao: PermissaoGoogle): Promise<string | null> {
  const i = await linhaGoogle(orgId);
  if (!i?.credenciais || i.status !== "conectado") return null;
  const t = JSON.parse(decifrar(i.credenciais)) as TokensGoogle;
  // legacy google_agenda rows have no recorded scopes but were calendar-only
  const permissoes = i.tipo === "google_agenda" ? ["agenda"] : permissoesDe(t.escopos);
  if (!permissoes.includes(permissao)) return null;
  try {
    return (await acesso("google", t as unknown as Credenciais, i.id)).access_token;
  } catch {
    await getDb().update(schema.integracoes).set({ status: "erro" }).where(eq(schema.integracoes.id, i.id));
    return null;
  }
}

/** Busy intervals from the primary calendar (merged with the internal agenda by the caller). */
export async function ocupadosGoogle(orgId: string, de: Date, ate: Date): Promise<{ inicio: Date; fim: Date }[] | null> {
  const at = await acessoCom(orgId, "agenda");
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
  const at = await acessoCom(orgId, "agenda");
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

/** RFC 2822 message, UTF-8 subject (RFC 2047), base64url for the Gmail API. */
export function mensagemGmail(para: string, assunto: string, corpo: string, de?: string): string {
  if (/[\r\n]/.test(para + assunto + (de ?? ""))) throw new ErroConector("Cabeçalho de e-mail inválido");
  const linhas = [
    ...(de ? [`From: ${de}`] : []),
    `To: ${para}`,
    `Subject: =?UTF-8?B?${Buffer.from(assunto).toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(corpo).toString("base64"),
  ];
  return Buffer.from(linhas.join("\r\n")).toString("base64url");
}

/** Sends from the business's own Gmail. Null when Gmail permission was not granted. */
export async function enviarGmail(orgId: string, para: string, assunto: string, corpo: string): Promise<string | null> {
  const at = await acessoCom(orgId, "gmail");
  if (!at) return null;
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${at}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: mensagemGmail(para, assunto, corpo) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new ErroConector(`Gmail recusou o envio (${r.status})`, r.status);
  return ((await r.json()) as { id: string }).id;
}

/** Revokes the grant at Google and removes the connection. */
export async function desconectarGoogle(orgId: string) {
  const i = await linhaGoogle(orgId);
  if (i?.credenciais) {
    const t = JSON.parse(decifrar(i.credenciais)) as TokensGoogle;
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refresh_token ?? t.access_token)}`, { method: "POST", signal: AbortSignal.timeout(8000) }).catch(() => null);
  }
  await getDb().delete(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), inArray(schema.integracoes.tipo, ["google", "google_agenda", "google_sheets"])));
}

/* ───────── Event adapter: Planilhas gets one row per call / hand-off ───────── */

async function pedir<T>(url: string, token: string, json?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: json === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(json !== undefined ? { "content-type": "application/json" } : {}) },
    body: json === undefined ? undefined : JSON.stringify(json),
    signal: AbortSignal.timeout(10_000),
  });
  const txt = await r.text();
  if (!r.ok) throw new ErroConector(`${r.status === 401 || r.status === 403 ? "Permissão recusada pelo Google" : `Erro ${r.status}`}: ${txt.slice(0, 160)}`, r.status);
  return (txt ? JSON.parse(txt) : {}) as T;
}

const linhaPlanilha = (e: Evento) => [
  e.quando,
  e.tipo === "teste" ? "Evento" : e.tipo === "repasse.criado" ? "Passado à equipe" : "Ligação",
  e.contato.telefone ?? "",
  e.contato.nome ?? "",
  e.titulo,
  e.resultado ?? "",
  e.texto,
];

async function anexar(c: Credenciais, token: string, e: Evento) {
  await pedir(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(c.planilhaId)}/values/A1:append?valueInputOption=USER_ENTERED`, token, { values: [linhaPlanilha(e)] });
}

export const google: Adaptador = {
  async testar(c) {
    const t = await acesso("google", c);
    Object.assign(c, t);
    const permissoes = permissoesDe((c as unknown as TokensGoogle).escopos);
    if (permissoes.includes("planilhas") && !c.planilhaId) {
      const nova = await pedir<{ spreadsheetId: string }>("https://sheets.googleapis.com/v4/spreadsheets", t.access_token, {
        properties: { title: "Recepta · Ligações" },
        sheets: [{ properties: { title: "Ligações" } }],
      });
      c.planilhaId = nova.spreadsheetId;
      await pedir(`https://sheets.googleapis.com/v4/spreadsheets/${nova.spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, t.access_token, {
        values: [["Quando", "Evento", "Telefone", "Nome", "Motivo", "Resultado", "Resumo"]],
      });
    }
    const email = (c as unknown as TokensGoogle).email ?? "Conta Google";
    return `${email} · ${permissoes.map((p) => PERMISSOES_GOOGLE[p].rotulo).join(", ") || "sem permissões"}`;
  },
  async enviar(c, e) {
    const permissoes = permissoesDe((c as unknown as TokensGoogle).escopos);
    if (!permissoes.includes("planilhas")) return "sem permissão de planilhas (ignorado)";
    if (!c.planilhaId) await google.testar(c);
    const t = await acesso("google", c);
    Object.assign(c, t);
    await anexar(c, t.access_token, e);
    return "linha adicionada na planilha";
  },
};

registrarAdaptador("google", google);
