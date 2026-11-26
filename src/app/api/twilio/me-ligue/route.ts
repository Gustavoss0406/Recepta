import { createHmac, timingSafeEqual } from "node:crypto";
import { assinarTokenVoz, verificarTokenVoz } from "@/server/voice/token";
import { tokenDaConta } from "@/server/telefonia/twilio";

const twiml = (corpo: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${corpo}</Response>`, { headers: { "content-type": "text/xml" } });

/** Twilio signs the full URL (query string included) + the sorted POST params. */
function assinaturaValida(url: string, params: Record<string, string>, assinatura: string | null, authToken: string | null): boolean {
  if (!authToken || !assinatura) return false;
  const esperado = createHmac("sha1", authToken).update(url + Object.keys(params).sort().map((k) => k + params[k]).join("")).digest();
  const recebido = Buffer.from(assinatura, "base64");
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/** The owner answered the "Me ligue agora" call: connect it to their draft receptionist. */
export async function POST(req: Request) {
  const params = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  const publico = (process.env.RECEPTA_URL_PUBLICA ?? new URL(req.url).origin).replace(/\/+$/, "");
  const u = new URL(req.url);
  const t = verificarTokenVoz(u.searchParams.get("t") ?? "");
  if (!t || t.canal !== "me_ligue") return twiml(`<Say language="pt-BR">Este link de teste expirou. Peça uma nova ligação no painel.</Say><Hangup/>`);
  const authToken = await tokenDaConta(t.orgId, params.AccountSid);
  if (!assinaturaValida(`${publico}${u.pathname}${u.search}`, params, req.headers.get("x-twilio-signature"), authToken)) return new Response("assinatura inválida", { status: 403 });
  if (params.AnsweredBy && /machine|fax/.test(params.AnsweredBy)) return twiml("<Hangup/>");

  const token = assinarTokenVoz({ orgId: t.orgId, agenteId: t.agenteId, canal: "me_ligue", de: t.de }, 120_000);
  const base = publico.replace(/^http/, "ws");
  const wss = process.env.VOICE_WS_PUBLICO ?? (process.env.VOZ_MESMA_ORIGEM === "1" ? base : `${base.replace(/:\d+$/, "")}:${process.env.VOICE_PORT ?? 3100}`);
  return twiml(`<Connect><Stream url="${wss}/twilio"><Parameter name="token" value="${token}"/></Stream></Connect>`);
}
