import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { orgIlimitada } from "@/server/billing/ilimitado";
import { assinarTokenVoz } from "@/server/voice/token";
import { contaTwilio, criarChamada, ErroTwilio, numerosDaConta } from "./twilio";

/**
 * "Me ligue agora": the receptionist calls the owner's phone so they can try the draft on a real
 * call — bookings, hand-offs, notifications and integrations all happen for real — before forwarding
 * the company's number. These calls don't use the plan's minutes; a daily cap keeps it a trial.
 */
export const LIGACOES_POR_DIA = 3;
export const DURACAO_MAX_S = 600;

export class ErroMeLigue extends Error {}

/** Brazilian numbers in any format → E.164 (+55…); other countries need the "+". */
export function telefoneE164(t: string): string | null {
  const s = t.trim();
  const d = s.replace(/\D/g, "");
  if (s.startsWith("+")) return d.length >= 10 && d.length <= 15 ? `+${d}` : null;
  const br = d.replace(/^0+/, "");
  if (br.startsWith("55") && (br.length === 12 || br.length === 13)) return `+${br}`;
  if (br.length === 10 || br.length === 11) return `+55${br}`;
  return null;
}

export async function ligacoesHoje(orgId: string, agora = new Date()): Promise<number> {
  const inicio = new Date(agora);
  inicio.setUTCHours(3, 0, 0, 0); // midnight in Brasília
  if (inicio > agora) inicio.setUTCDate(inicio.getUTCDate() - 1);
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(schema.conversas)
    .where(and(eq(schema.conversas.orgId, orgId), eq(schema.conversas.canal, "me_ligue"), gte(schema.conversas.iniciadaEm, inicio)));
  return Number(n);
}

/** Number the call comes from: TWILIO_NUMERO_TESTE, else a voice number of the account in use. */
async function numeroDeOrigem(conta: NonNullable<Awaited<ReturnType<typeof contaTwilio>>>): Promise<string> {
  if (conta.origem === "plataforma" && process.env.TWILIO_NUMERO_TESTE) return process.env.TWILIO_NUMERO_TESTE;
  const n = (await numerosDaConta(conta))[0];
  if (!n) throw new ErroMeLigue("A conta de telefonia ainda não tem número para fazer a ligação.");
  return n.numero;
}

export async function ligarParaMim(orgId: string, agenteId: string, telefone: string) {
  const para = telefoneE164(telefone);
  if (!para) throw new ErroMeLigue("Confira o número: use DDD + celular, por exemplo (11) 98765-4321.");
  if (!orgIlimitada(orgId) && (await ligacoesHoje(orgId)) >= LIGACOES_POR_DIA)
    throw new ErroMeLigue(`Você já fez as ${LIGACOES_POR_DIA} ligações de teste de hoje. Amanhã libera de novo.`);
  const publico = process.env.RECEPTA_URL_PUBLICA;
  if (!publico || !/^https:\/\//.test(publico)) throw new ErroMeLigue("Telefonia ainda não configurada (RECEPTA_URL_PUBLICA).");
  const conta = await contaTwilio(orgId);
  if (!conta) throw new ErroMeLigue("Telefonia ainda não configurada na Recepta. Tente de novo mais tarde.");
  const de = await numeroDeOrigem(conta);
  // the token travels in the TwiML URL: valid only long enough for the phone to ring and be answered
  const token = assinarTokenVoz({ orgId, agenteId, canal: "me_ligue", de: para }, 3 * 60_000);
  try {
    return await criarChamada(conta, { para, de, url: `${publico.replace(/\/+$/, "")}/api/twilio/me-ligue?t=${encodeURIComponent(token)}`, limiteS: DURACAO_MAX_S });
  } catch (e) {
    if (e instanceof ErroTwilio && [21211, 21214, 21217].includes(e.codigo ?? 0)) throw new ErroMeLigue("Esse número não pode receber ligação. Confira o DDD e o número.");
    if (e instanceof ErroTwilio && e.codigo === 21219) throw new ErroMeLigue("Na conta de teste da telefonia, só números verificados recebem ligação. Verifique o seu na Twilio ou faça o upgrade da conta.");
    throw e;
  }
}
