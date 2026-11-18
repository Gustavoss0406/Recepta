import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Blocks SSRF: only public http(s) hosts may be fetched from user-supplied URLs. */
export async function urlPublicaSegura(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw new Error("Endereço inválido");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Use um endereço http ou https");
  if (u.username || u.password) throw new Error("Endereço inválido");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Endereço não permitido");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(ipPrivado)) throw new Error("Endereço não permitido");
  return u;
}

export function ipPrivado(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l === "::" || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") || l.startsWith("::ffff:192.168.");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}
