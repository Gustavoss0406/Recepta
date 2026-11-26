import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TokenVoz {
  orgId: string;
  agenteId: string;
  canal: "teste_voz" | "simulador" | "telefone" | "me_ligue" | "widget";
  de?: string;
  exp: number; // epoch ms
}

function segredo(): string {
  const s = process.env.RECEPTA_SEGREDO;
  if (!s && process.env.NODE_ENV === "production") throw new Error("RECEPTA_SEGREDO não configurado");
  return s ?? "dev-segredo-recepta-nao-use-em-producao";
}

/** Short-lived signed token that authorizes one browser voice session on the gateway. */
export function assinarTokenVoz(t: Omit<TokenVoz, "exp">, validadeMs = 60_000): string {
  const corpo = Buffer.from(JSON.stringify({ ...t, exp: Date.now() + validadeMs })).toString("base64url");
  const sig = createHmac("sha256", segredo()).update(corpo).digest("base64url");
  return `${corpo}.${sig}`;
}

export function verificarTokenVoz(token: string): TokenVoz | null {
  const [corpo, sig] = token.split(".");
  if (!corpo || !sig) return null;
  const esperado = createHmac("sha256", segredo()).update(corpo).digest();
  const recebido = Buffer.from(sig, "base64url");
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return null;
  const t = JSON.parse(Buffer.from(corpo, "base64url").toString()) as TokenVoz;
  return t.exp > Date.now() ? t : null;
}
