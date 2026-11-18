"use server";

import { headers } from "next/headers";
import { exigirSessao } from "@/server/auth/session";
import { obterAgente } from "@/server/agent/agentes";
import { assinarTokenVoz } from "@/server/voice/token";

/** Issues a 60-second token for one browser voice session on the gateway. */
export async function tokenVoz(agenteId: string, canal: "teste_voz" | "simulador") {
  const s = await exigirSessao();
  await obterAgente(s.org.id, agenteId);
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(":")[0];
  const proto = h.get("x-forwarded-proto") === "https" ? "wss" : "ws";
  const url = process.env.NEXT_PUBLIC_VOICE_URL ?? `${proto}://${host}:${process.env.VOICE_PORT ?? 3100}`;
  return { token: assinarTokenVoz({ orgId: s.org.id, agenteId, canal }), url };
}
