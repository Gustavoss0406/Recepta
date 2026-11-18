/** Applies SQL migrations to DATABASE_URL. Run: npm run db:migrate */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { opcoesConexao } from "./conexao";

const opts = opcoesConexao();
const pool = new Pool(opts);
await migrate(drizzle(pool), { migrationsFolder: new URL("./migrations", import.meta.url).pathname });
// Supabase exposes the public schema through its REST API: keep every table behind RLS (no policies =
// no access for anon/authenticated). The app connects as the table owner and is not affected.
await pool.query(`do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' and not rowsecurity loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop; end $$`);
await pool.end();
console.log("Migrações aplicadas em", String(opts.connectionString).replace(/:[^:@/]+@/, ":***@"));
