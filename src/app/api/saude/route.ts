import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

/** Health check for the host (Render/Koyeb): web app up and database reachable. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, erro: "banco indisponível" }, { status: 503 });
  }
}
export const dynamic = "force-dynamic";
