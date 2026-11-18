/** Applies SQL migrations to DATABASE_URL. Run: npm run db:migrate */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL ?? "postgres://recepta:recepta@127.0.0.1:5432/recepta";
const pool = new Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: new URL("./migrations", import.meta.url).pathname });
await pool.end();
console.log("Migrações aplicadas em", url.replace(/:[^:@/]+@/, ":***@"));
