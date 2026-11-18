import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { cifrar, decifrar } from "@/server/cripto";
import { ErroConector, registrarAdaptador, type Adaptador, type Credenciais, type Evento } from "./conectores";

/**
 * Generic OAuth 2.0 (authorization code) for connectors that need a platform app registration.
 * Each is enabled once <PREFIX>_CLIENT_ID and <PREFIX>_CLIENT_SECRET are set; until then the
 * Integrations screen shows the button disabled ("aguardando app").
 */
interface ProvedorOAuth {
  env: string;
  autorizar: string;
  token: string;
  escopos: string[];
  extra?: Record<string, string>;
}

export const OAUTH: Record<string, ProvedorOAuth> = {
  google_sheets: {
    env: "GOOGLE",
    autorizar: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    escopos: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"],
    extra: { access_type: "offline", prompt: "consent" },
  },
  outlook: {
    env: "MICROSOFT",
    autorizar: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    escopos: ["offline_access", "Calendars.ReadWrite", "User.Read"],
  },
  salesforce: {
    env: "SALESFORCE",
    autorizar: "https://login.salesforce.com/services/oauth2/authorize",
    token: "https://login.salesforce.com/services/oauth2/token",
    escopos: ["api", "refresh_token"],
  },
};

export function oauthConfigurado(id: string): boolean {
  const p = OAUTH[id];
  return Boolean(p && process.env[`${p.env}_CLIENT_ID`] && process.env[`${p.env}_CLIENT_SECRET`]);
}

export function urlAutorizacao(id: string, redirectUri: string, state: string) {
  const p = OAUTH[id];
  const q = new URLSearchParams({ client_id: process.env[`${p.env}_CLIENT_ID`]!, redirect_uri: redirectUri, response_type: "code", scope: p.escopos.join(" "), state, ...p.extra });
  return `${p.autorizar}?${q}`;
}

interface Tokens {
  access_token: string;
  refresh_token?: string;
  expira: number;
  instance_url?: string; // Salesforce
}

async function trocar(id: string, params: Record<string, string>): Promise<Tokens> {
  const p = OAUTH[id];
  const r = await fetch(p.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ client_id: process.env[`${p.env}_CLIENT_ID`]!, client_secret: process.env[`${p.env}_CLIENT_SECRET`]!, ...params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new ErroConector(`Autorização recusada (${r.status})`, r.status);
  const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in?: number; instance_url?: string };
  return { access_token: j.access_token, refresh_token: j.refresh_token, instance_url: j.instance_url, expira: Date.now() + ((j.expires_in ?? 3600) - 60) * 1000 };
}

export async function concluirOAuth(orgId: string, id: string, code: string, redirectUri: string) {
  const t = await trocar(id, { code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  const db = getDb();
  await db.delete(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, id)));
  await db.insert(schema.integracoes).values({
    orgId,
    tipo: id,
    status: "conectado",
    credenciais: cifrar(JSON.stringify(t)),
    detalhes: { conta: t.instance_url ? new URL(t.instance_url).host : "Conta conectada", conectadoEm: new Date().toISOString(), historico: [] },
  });
}

/** Access token, refreshed and re-saved when expired. Credentials blob = Tokens (+ connector settings). */
type ComTokens = Tokens & Record<string, unknown>;
export async function acesso(id: string, c: Credenciais, integracaoId?: string): Promise<ComTokens> {
  const t = c as unknown as ComTokens;
  if (t.expira > Date.now()) return t;
  if (!t.refresh_token) throw new ErroConector("Autorização expirada: reconecte", 401);
  const novo: ComTokens = { ...t, ...(await trocar(id, { refresh_token: t.refresh_token, grant_type: "refresh_token" })), refresh_token: t.refresh_token };
  if (integracaoId) await getDb().update(schema.integracoes).set({ credenciais: cifrar(JSON.stringify(novo)) }).where(eq(schema.integracoes.id, integracaoId));
  return novo;
}

export function lerTokens(cifrado: string): Credenciais {
  return JSON.parse(decifrar(cifrado));
}

/* ───────── Adapters that use OAuth tokens ───────── */

async function pedir<T>(url: string, token: string, json?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: json === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(json !== undefined ? { "content-type": "application/json" } : {}) },
    body: json === undefined ? undefined : JSON.stringify(json),
    signal: AbortSignal.timeout(10_000),
  });
  const txt = await r.text();
  if (!r.ok) throw new ErroConector(`${r.status === 401 || r.status === 403 ? "Credencial recusada pelo serviço" : `Erro ${r.status}`}: ${txt.slice(0, 160)}`, r.status);
  return (txt ? JSON.parse(txt) : {}) as T;
}

export const salesforce: Adaptador = {
  async testar(c) {
    const t = await acesso("salesforce", c);
    await pedir(`${t.instance_url}/services/data/v61.0/limits`, t.access_token);
    return new URL(t.instance_url!).host;
  },
  async enviar(c, e: Evento) {
    const t = await acesso("salesforce", c);
    const [primeiro, ...resto] = (e.contato.nome?.trim() || "Cliente").split(" ");
    const r = await pedir<{ id: string }>(`${t.instance_url}/services/data/v61.0/sobjects/Lead`, t.access_token, {
      FirstName: primeiro,
      LastName: resto.join(" ") || "(via Recepta)",
      Company: "Contato por telefone",
      Phone: e.contato.telefone ?? undefined,
      LeadSource: "Phone Inquiry",
      Description: `${e.titulo}\n\n${e.texto}`.slice(0, 32000),
    });
    return `lead ${r.id}`;
  },
};

/** Google Sheets: one row per call (date, phone, name, reason, result, summary) in a spreadsheet the app creates. */
export const googleSheets: Adaptador = {
  async testar(c) {
    const t = await acesso("google_sheets", c);
    if (!c.planilhaId) {
      const nova = await pedir<{ spreadsheetId: string }>("https://sheets.googleapis.com/v4/spreadsheets", t.access_token, {
        properties: { title: "Recepta · Ligações" },
        sheets: [{ properties: { title: "Ligações" } }],
      });
      c.planilhaId = nova.spreadsheetId;
      await googleSheets.enviar(c, { tipo: "teste", titulo: "Evento", texto: "Resumo", contato: { nome: "Nome", telefone: "Telefone" }, resultado: "Resultado", quando: "Data" });
    }
    return `Planilha ${c.planilhaId.slice(0, 8)}…`;
  },
  async enviar(c, e) {
    const t = await acesso("google_sheets", c);
    if (!c.planilhaId) throw new ErroConector("Planilha não criada: teste a conexão");
    await pedir(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(c.planilhaId)}/values/A1:append?valueInputOption=USER_ENTERED`, t.access_token, {
      values: [[e.quando, e.tipo === "teste" ? "Evento" : e.tipo === "repasse.criado" ? "Passado à equipe" : "Ligação", e.contato.telefone ?? "", e.contato.nome ?? "", e.titulo, e.resultado ?? "", e.texto]],
    });
    return "linha adicionada";
  },
};

registrarAdaptador("salesforce", salesforce);
registrarAdaptador("google_sheets", googleSheets);
