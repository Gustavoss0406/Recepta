import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM for third-party credentials at rest (key from RECEPTA_CHAVE_CRIPTO). */
function chave(): Buffer {
  const k = process.env.RECEPTA_CHAVE_CRIPTO;
  if (!k && process.env.NODE_ENV === "production") throw new Error("RECEPTA_CHAVE_CRIPTO não configurada");
  return createHash("sha256").update(k ?? "dev-chave-recepta").digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString("base64url")).join(".");
}

export function decifrar(cifrado: string): string {
  const [iv, tag, dados] = cifrado.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", chave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(dados), d.final()]).toString("utf8");
}
