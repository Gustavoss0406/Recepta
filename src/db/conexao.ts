import type { PoolConfig } from "pg";

/**
 * Postgres connection options. Managed hosts (Supabase, Neon) require TLS; their poolers present
 * certificates from their own CA, so certificate pinning is left to the provider's network.
 */
export function opcoesConexao(url = process.env.DATABASE_URL ?? "postgres://recepta:recepta@127.0.0.1:5432/recepta"): PoolConfig {
  const gerenciado = /supabase\.(co|com)|neon\.tech|pooler\./.test(url);
  const limpa = url.replace(/[?&]sslmode=[^&]*/g, "");
  return { connectionString: limpa, ...(gerenciado ? { ssl: { rejectUnauthorized: false } } : {}) };
}
