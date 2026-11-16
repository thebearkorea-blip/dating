import { getCurrentUser } from "@/auth/index";
import { now as clockNow } from "@/clock";
import { getDb } from "@/db/client";
import { findOwnedRelationship } from "@/engine/chat-view";
import { searchMessages } from "@/engine/chat-search";

export const dynamic = "force-dynamic";

/** ?q=<2자 이상>. 본인 관계의 도착한 메시지만. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const db = getDb();
  const rel = await findOwnedRelationship(db, user.id);
  if (!rel) return new Response(null, { status: 404 });
  const hits = await searchMessages(db, rel.id, q.slice(0, 100), clockNow());
  return Response.json({ hits }, { headers: { "cache-control": "no-store" } });
}
