"use server";

import { headers } from "next/headers";
import { exigirSessao } from "@/server/auth/session";
import { obterAgente } from "@/server/agent/agentes";
import { assinarTokenVoz } from "@/server/voice/token";
import { urlVozNavegador } from "@/server/voice/url";

/** Issues a 60-second token for one browser voice session on the gateway. */
export async function tokenVoz(agenteId: string, canal: "teste_voz" | "simulador") {
  const s = await exigirSessao();
  await obterAgente(s.org.id, agenteId);
  const h = await headers();
  const url = urlVozNavegador(h);
  return { token: assinarTokenVoz({ orgId: s.org.id, agenteId, canal }), url };
}
