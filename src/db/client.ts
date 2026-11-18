import "server-only";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";
import { opcoesConexao } from "./conexao";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __receptaDb?: Db; __receptaPool?: Pool };

/** Process-wide database handle. Tests swap it for an in-memory PGlite via setDb(). */
export function getDb(): Db {
  if (!g.__receptaDb) {
    g.__receptaPool = new Pool({ ...opcoesConexao(), max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
    g.__receptaDb = drizzlePg(g.__receptaPool, { schema }) as unknown as Db;
  }
  return g.__receptaDb;
}

export function setDb(db: Db) {
  g.__receptaDb = db;
}

export { schema };
