import { getCurrentUser } from "@/auth/index";
import { now as clockNow } from "@/clock";
import { getDb } from "@/db/client";
import { buildUserExport } from "@/engine/data-export";
import { recordEvent } from "@/engine/events";

export const dynamic = "force-dynamic";

/** 로그인한 본인의 데이터만 JSON 첨부로 내려준다. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const db = getDb();
  const now = clockNow();
  const data = await buildUserExport(db, user.id, now);
  await recordEvent(db, user.id, "data_exported", { now });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="my-data-${now.toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
