import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { cifrar, decifrar } from "@/server/cripto";
import { ADAPTADORES, ErroConector, registrarAdaptador, type Adaptador, type Credenciais, type Evento } from "./conectores";

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
  /** Token endpoint wants client credentials in an HTTP Basic header (Pipedrive). */
  basic?: boolean;
}

export const OAUTH: Record<string, ProvedorOAuth> = {
  // Google has its own consent route with per-permission scopes (src/server/integracoes/google.ts);
  // this entry is only used to refresh tokens.
  google: {
    env: "GOOGLE",
    autorizar: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    escopos: [],
  },
  hubspot: {
    env: "HUBSPOT",
    autorizar: "https://app.hubspot.com/oauth/authorize",
    token: "https://api.hubapi.com/oauth/v1/token",
    escopos: ["oauth", "crm.objects.contacts.read", "crm.objects.contacts.write"],
  },
  pipedrive: {
    env: "PIPEDRIVE",
    autorizar: "https://oauth.pipedrive.com/oauth/authorize",
    token: "https://oauth.pipedrive.com/oauth/token",
    escopos: [], // Pipedrive scopes are chosen in the app registration
    basic: true,
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
  api_domain?: string; // Pipedrive
  escopos?: string[]; // granted scopes (Google)
}

async function trocar(id: string, params: Record<string, string>): Promise<Tokens> {
  const p = OAUTH[id];
  const cid = process.env[`${p.env}_CLIENT_ID`]!;
  const sec = process.env[`${p.env}_CLIENT_SECRET`]!;
  const r = await fetch(p.token, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      ...(p.basic ? { authorization: `Basic ${Buffer.from(`${cid}:${sec}`).toString("base64")}` } : {}),
    },
    body: new URLSearchParams(p.basic ? params : { client_id: cid, client_secret: sec, ...params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new ErroConector(`Autorização recusada (${r.status})`, r.status);
  const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in?: number; instance_url?: string; api_domain?: string; scope?: string };
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    instance_url: j.instance_url,
    api_domain: j.api_domain,
    ...(j.scope ? { escopos: j.scope.split(/[ ,]+/).filter(Boolean) } : {}),
    expira: Date.now() + ((j.expires_in ?? 3600) - 60) * 1000,
  };
}

export { trocar as trocarCodigoOAuth };

export async function concluirOAuth(orgId: string, id: string, code: string, redirectUri: string) {
  const t = await trocar(id, { code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  let conta = t.instance_url ? new URL(t.instance_url).host : "Conta conectada";
  try {
    conta = (await ADAPTADORES[id]?.testar(t as unknown as Credenciais)) ?? conta;
  } catch {
    /* label only */
  }
  const db = getDb();
  await db.delete(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, id)));
  await db.insert(schema.integracoes).values({
    orgId,
    tipo: id,
    status: "conectado",
    credenciais: cifrar(JSON.stringify(t)),
    detalhes: { conta, conectadoEm: new Date().toISOString(), historico: [] },
  });
}

/** Access token, refreshed and re-saved when expired. Credentials blob = Tokens (+ connector settings). */
type ComTokens = Tokens & Record<string, unknown>;
export async function acesso(id: string, c: Credenciais | Record<string, unknown>, integracaoId?: string): Promise<ComTokens> {
  const t = c as unknown as ComTokens;
  if (t.expira > Date.now()) return t;
  if (!t.refresh_token) throw new ErroConector("Autorização expirada: reconecte", 401);
  const renovado = await trocar(id, { refresh_token: t.refresh_token, grant_type: "refresh_token" });
  // keep what the refresh response omits (refresh token, granted scopes, api domain)
  const novo: ComTokens = { ...t, ...Object.fromEntries(Object.entries(renovado).filter(([, v]) => v !== undefined)), refresh_token: renovado.refresh_token ?? t.refresh_token };
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

registrarAdaptador("salesforce", salesforce);

/** Token connectors that also accept "Entrar com …": refresh the OAuth token, then reuse the token adapter. */
function comOAuth(id: string, base: Adaptador): Adaptador {
  const pronto = async (c: Credenciais) => (c.access_token ? Object.assign(c, await acesso(id, c)) : c);
  return { testar: async (c) => base.testar(await pronto(c)), enviar: async (c, e) => base.enviar(await pronto(c), e) };
}
for (const id of ["hubspot", "pipedrive"]) registrarAdaptador(id, comOAuth(id, ADAPTADORES[id]));
