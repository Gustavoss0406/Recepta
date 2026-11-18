import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/db/schema";
import { setDb, type Db } from "@/db/client";

/** Fresh in-memory Postgres (PGlite) with all migrations applied, installed as the app db. */
export async function novoBancoDeTeste(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../src/db/migrations") });
  setDb(db as unknown as Db);
  return db as unknown as Db;
}
