import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { credenciaisDe } from "@/server/integracoes/servico";

/**
 * Twilio numbers from the panel: search, buy, import from the account, point to the receptionist
 * and release. Uses the customer's own Twilio (Integrações › Twilio) when connected, otherwise the
 * Recepta platform account (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).
 */
export interface ContaTwilio {
  sid: string;
  token: string;
  origem: "cliente" | "plataforma";
}

export class ErroTwilio extends Error {
  constructor(
    msg: string,
    readonly status = 0,
    readonly codigo?: number,
  ) {
    super(msg);
  }
}

export async function contaTwilio(orgId: string): Promise<ContaTwilio | null> {
  const c = await credenciaisDe(orgId, "twilio");
  if (c?.accountSid && c.authToken) return { sid: c.accountSid, token: c.authToken, origem: "cliente" };
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
    return { sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN, origem: "plataforma" };
  return null;
}

/** Auth token that signs webhooks for this Account SID (customer account or platform). */
export async function tokenDaConta(orgId: string, accountSid?: string): Promise<string | null> {
  const c = await credenciaisDe(orgId, "twilio");
  if (c?.accountSid && c.authToken && (!accountSid || c.accountSid === accountSid)) return c.authToken;
  if (!accountSid || accountSid === process.env.TWILIO_ACCOUNT_SID) return process.env.TWILIO_AUTH_TOKEN ?? null;
  return null;
}

/** Plain-language messages for the Twilio errors a customer actually hits. */
function traduzir(codigo: number | undefined, msg: string): string {
  switch (codigo) {
    case 21452:
    case 21422:
      return "Esse número não está mais disponível. Busque de novo.";
    case 21631:
    case 21649:
    case 21615:
      return "Números deste país exigem cadastro regulatório na Twilio (documento da empresa e endereço). Faça o cadastro em Twilio › Regulatory Compliance e tente de novo.";
    case 20003:
      return "A Twilio recusou a credencial. Confira o Account SID e o Auth Token.";
    case 21404:
      return "Contas Trial da Twilio só têm um número grátis. Faça upgrade da conta para comprar outro.";
    default:
      return `Twilio: ${msg}`;
  }
}

async function api<T>(conta: ContaTwilio, caminho: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<T> {
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${conta.sid}${caminho}`, {
    method: init.method ?? (init.form ? "POST" : "GET"),
    headers: {
      authorization: `Basic ${Buffer.from(`${conta.sid}:${conta.token}`).toString("base64")}`,
      accept: "application/json",
      ...(init.form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init.form ? new URLSearchParams(init.form) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 204) return {} as T;
  const j = (await r.json().catch(() => ({}))) as T & { code?: number; message?: string };
  if (!r.ok) throw new ErroTwilio(traduzir(j.code, j.message ?? `erro ${r.status}`), r.status, j.code);
  return j;
}

export interface Disponivel {
  numero: string;
  formatado: string;
  local: string;
  sms: boolean;
}

export async function buscarDisponiveis(conta: ContaTwilio, f: { pais: string; ddd?: string; contem?: string }): Promise<Disponivel[]> {
  const pais = /^[A-Z]{2}$/.test(f.pais) ? f.pais : "US";
  const q = new URLSearchParams({ VoiceEnabled: "true", PageSize: "10" });
  const ddd = (f.ddd ?? "").replace(/\D/g, "");
  // US/CA use AreaCode; elsewhere the area code is matched as a number prefix
  if (ddd && (pais === "US" || pais === "CA")) q.set("AreaCode", ddd);
  else if (ddd) q.set("Contains", `${pais === "BR" ? "55" : ""}${ddd}*`);
  if (f.contem && !ddd) q.set("Contains", f.contem.replace(/[^\d*]/g, ""));
  const j = await api<{ available_phone_numbers: { phone_number: string; friendly_name: string; locality?: string; region?: string; capabilities: { SMS?: boolean; sms?: boolean } }[] }>(
    conta,
    `/AvailablePhoneNumbers/${pais}/Local.json?${q}`,
  );
  return j.available_phone_numbers.map((n) => ({
    numero: n.phone_number,
    formatado: n.friendly_name,
    local: [n.locality, n.region].filter((x) => x && x !== pais).join(", "),
    sms: Boolean(n.capabilities.SMS ?? n.capabilities.sms),
  }));
}

export interface NumeroConta {
  sid: string;
  numero: string;
  formatado: string;
  voiceUrl: string | null;
}

export async function numerosDaConta(conta: ContaTwilio): Promise<NumeroConta[]> {
  const j = await api<{ incoming_phone_numbers: { sid: string; phone_number: string; friendly_name: string; voice_url: string | null; capabilities: { voice: boolean } }[] }>(
    conta,
    "/IncomingPhoneNumbers.json?PageSize=50",
  );
  return j.incoming_phone_numbers.filter((n) => n.capabilities.voice).map((n) => ({ sid: n.sid, numero: n.phone_number, formatado: n.friendly_name, voiceUrl: n.voice_url }));
}

export function urlVoz(): string | null {
  const base = process.env.RECEPTA_URL_PUBLICA;
  return base && /^https:\/\//.test(base) ? `${base.replace(/\/+$/, "")}/api/twilio/voz` : null;
}

const apontamento = (url: string | null): Record<string, string> => (url ? { VoiceUrl: url, VoiceMethod: "POST" } : {});

export async function comprarNumero(conta: ContaTwilio, numero: string): Promise<NumeroConta> {
  if (!/^\+\d{8,15}$/.test(numero)) throw new ErroTwilio("Número inválido");
  const j = await api<{ sid: string; phone_number: string; friendly_name: string; voice_url: string | null }>(conta, "/IncomingPhoneNumbers.json", {
    form: { PhoneNumber: numero, FriendlyName: "Recepta", ...apontamento(urlVoz()) },
  });
  return { sid: j.sid, numero: j.phone_number, formatado: j.friendly_name, voiceUrl: j.voice_url };
}

export async function apontarNumero(conta: ContaTwilio, sid: string): Promise<string> {
  const url = urlVoz();
  if (!url) throw new ErroTwilio("Defina RECEPTA_URL_PUBLICA (https) para a Twilio encontrar a recepcionista.");
  await api(conta, `/IncomingPhoneNumbers/${encodeURIComponent(sid)}.json`, { form: apontamento(url) });
  return url;
}

export async function liberarNumero(conta: ContaTwilio, sid: string) {
  await api(conta, `/IncomingPhoneNumbers/${encodeURIComponent(sid)}.json`, { method: "DELETE" });
}

/** Records the number for the org's receptionist (idempotent by E.164). */
export async function registrarNumero(orgId: string, agenteId: string | null, n: NumeroConta, apontado: boolean) {
  const db = getDb();
  const [existe] = await db.select().from(schema.numeros).where(and(eq(schema.numeros.orgId, orgId), eq(schema.numeros.e164, n.numero)));
  const valores = { agenteId, tipo: "proprio" as const, operadora: "twilio", provedorSid: n.sid, verificadoEm: apontado ? new Date() : null };
  if (existe) await db.update(schema.numeros).set(valores).where(eq(schema.numeros.id, existe.id));
  else await db.insert(schema.numeros).values({ orgId, e164: n.numero, ...valores });
}

/** Places an outbound call; Twilio fetches the TwiML at `url` once the person answers. */
export async function criarChamada(conta: ContaTwilio, c: { para: string; de: string; url: string; limiteS?: number }): Promise<{ sid: string }> {
  const j = await api<{ sid: string }>(conta, "/Calls.json", {
    form: { To: c.para, From: c.de, Url: c.url, Method: "POST", TimeLimit: String(c.limiteS ?? 600), Timeout: "30" },
  });
  return { sid: j.sid };
}
