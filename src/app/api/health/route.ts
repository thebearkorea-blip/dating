import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
