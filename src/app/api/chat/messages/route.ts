import { getCurrentUser } from "@/auth/index";
import { now as clockNow } from "@/clock";
import { getDb } from "@/db/client";
import { findOwnedRelationship, loadChatMeta, loadMessages, PAGE_LIMIT, type MessageQuery } from "@/engine/chat-view";

export const dynamic = "force-dynamic";

const notFound = () => new Response(null, { status: 404 });

/** ?after=<id> | ?before=<id>&limit=50 | ?around=<id> | (없음=최신). 선택적 ?rel=<id>는 본인 관계일 때만. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const p = new URL(req.url).searchParams;
  const db = getDb();
  const rel = await findOwnedRelationship(db, user.id, p.get("rel") ?? undefined);
  if (!rel) return notFound();

  const limit = Math.min(Math.max(Number.parseInt(p.get("limit") ?? "", 10) || PAGE_LIMIT, 1), PAGE_LIMIT);
  const after = p.get("after");
  const before = p.get("before");
  const around = p.get("around");
  const q: MessageQuery = after ? { mode: "after", id: after } : before ? { mode: "before", id: before, limit } : around ? { mode: "around", id: around } : { mode: "latest" };

  const now = clockNow();
  const page = await loadMessages(db, rel.id, q, now);
  if (!page) return notFound();
  const meta = await loadChatMeta(db, rel, now);
  return Response.json({ messages: page.messages, serverNow: meta.serverNow, wakeAt: meta.wakeAt, typing: meta.typing, hasMoreBefore: page.hasMoreBefore, activity: meta.activity, mine: meta.mine, charReactions: meta.charReactions }, { headers: { "cache-control": "no-store" } });
}
