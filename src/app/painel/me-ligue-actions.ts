"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";
import { obterAgente } from "@/server/agent/agentes";
import { ErroTwilio } from "@/server/telefonia/twilio";
import { ErroMeLigue, ligarParaMim, telefoneE164 } from "@/server/telefonia/me-ligue";

/** "Me ligue agora": the draft receptionist calls the owner's phone (real actions, no minutes charged). */
export async function meLigueAgora(agenteId: string, telefone: string): Promise<{ ok?: boolean; erro?: string; mensagem?: string }> {
  const s = await exigirPermissao("editarAgente");
  await obterAgente(s.org.id, agenteId);
  try {
    await ligarParaMim(s.org.id, agenteId, telefone);
  } catch (e) {
    if (e instanceof ErroMeLigue || e instanceof ErroTwilio) return { erro: e.message };
    console.error("[me ligue]", e);
    return { erro: "Não consegui fazer a ligação agora. Tente de novo em instantes." };
  }
  // remember the number for next time
  const e164 = telefoneE164(telefone);
  const [org] = await getDb().select({ t: schema.organizacoes.telefoneContato }).from(schema.organizacoes).where(eq(schema.organizacoes.id, s.org.id));
  if (e164 && !org?.t) await getDb().update(schema.organizacoes).set({ telefoneContato: e164 }).where(eq(schema.organizacoes.id, s.org.id));
  return { ok: true, mensagem: "Ligando! Atende o celular em alguns segundos." };
}
