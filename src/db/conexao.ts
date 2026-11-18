import type { PoolConfig } from "pg";

/**
 * Postgres connection options. Managed hosts (Supabase, Neon) require TLS; their poolers present
 * certificates from their own CA, so certificate pinning is left to the provider's network.
 */
export function opcoesConexao(url = process.env.DATABASE_URL ?? "postgres://recepta:recepta@127.0.0.1:5432/recepta"): PoolConfig {
  const gerenciado = /supabase\.(co|com)|neon\.tech|pooler\./.test(url);
  const limpa = codificarSenha(url).replace(/[?&]sslmode=[^&]*/g, "");
  return { connectionString: limpa, ...(gerenciado ? { ssl: { rejectUnauthorized: false } } : {}) };
}

/**
 * Pasted connection strings often carry the raw password: characters like "#", "?", "/" or "@"
 * break URL parsing ("Invalid URL"). Re-encode the password part; already-encoded ones stay the same.
 */
export function codificarSenha(url: string): string {
  const m = /^(\w+:\/\/[^:@/]+:)(.*)(@[^@/]+(?::\d+)?\/.*)$/.exec(url.trim());
  if (!m) return url.trim();
  let senha = m[2];
  try {
    senha = decodeURIComponent(senha);
  } catch {
    /* raw "%" in the password: encode as is */
  }
  return m[1] + encodeURIComponent(senha) + m[3];
}
