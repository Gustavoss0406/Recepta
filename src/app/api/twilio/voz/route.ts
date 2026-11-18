import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { assinarTokenVoz } from "@/server/voice/token";

/** Validates X-Twilio-Signature (HMAC-SHA1 of URL + sorted POST params with the auth token). */
function assinaturaValida(url: string, params: Record<string, string>, assinatura: string | null): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !assinatura) return false;
  const dados = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const esperado = createHmac("sha1", authToken).update(dados).digest();
  const recebido = Buffer.from(assinatura, "base64");
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

const twiml = (corpo: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${corpo}</Response>`, { headers: { "content-type": "text/xml" } });

/** Inbound call webhook: maps the dialed number to its agent and connects a media stream to the voice gateway. */
export async function POST(req: Request) {
  const params = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  const publico = process.env.RECEPTA_URL_PUBLICA ?? new URL(req.url).origin;
  if (!assinaturaValida(`${publico}/api/twilio/voz`, params, req.headers.get("x-twilio-signature")))
    return new Response("assinatura inválida", { status: 403 });

  const [n] = await getDb()
    .select()
    .from(schema.numeros)
    .where(and(eq(schema.numeros.e164, params.To ?? ""), eq(schema.numeros.tipo, "proprio")))
    .limit(1);
  if (!n?.agenteId) return twiml(`<Say language="pt-BR">Número não configurado.</Say><Hangup/>`);

  const token = assinarTokenVoz({ orgId: n.orgId, agenteId: n.agenteId, canal: "telefone", de: params.From }, 120_000);
  const wss = process.env.VOICE_WS_PUBLICO ?? "wss://voz.recepta.ai";
  return twiml(`<Connect><Stream url="${wss}/twilio"><Parameter name="token" value="${token}"/></Stream></Connect>`);
}
