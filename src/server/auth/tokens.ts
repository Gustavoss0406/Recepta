import { createHash, randomBytes } from "node:crypto";

export function novoToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}
