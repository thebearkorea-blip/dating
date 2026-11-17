// 내 데이터 내려받기. 이 사용자의 행만, 공개 필드만 싣는다.
// 제외: relationships의 숨김 컬럼(affection·sulk*·affection*·pending*·reconcile*·profile*·memoryCursorAt 등), ratings·review_findings(내부 로그), 아직 도착 전(deliver_at > now) 메시지·그의 미래 반응.
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { events, memories, messages, reactions, relationships, users } from "../db/schema/index";
import { visible } from "./chat-view.js";

export async function buildUserExport(db: Db, userId: string, now: Date) {
  const [u] = await db
    .select({ displayName: users.displayName, city: users.city, tz: users.tz, birthYear: users.birthYear, ageBand: users.ageBand, aiNoticeAcceptedAt: users.aiNoticeAcceptedAt, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const rels = await db
    .select({ id: relationships.id, characterId: relationships.characterId, mode: relationships.mode, startedAt: relationships.startedAt, stage: relationships.stage, endedAt: relationships.endedAt, pushWindow: relationships.pushWindow, pushMax: relationships.pushMax })
    .from(relationships)
    .where(eq(relationships.userId, userId));
  const relIds = rels.map((r) => r.id);
  const msgs = relIds.length
    ? await db
        .select({ id: messages.id, relId: messages.relId, sender: messages.sender, text: messages.text, mediaId: messages.mediaId, at: messages.deliverAt, replyTo: messages.replyTo })
        .from(messages)
        .where(or(...relIds.map((id) => visible(id, now))))
        .orderBy(asc(messages.deliverAt), asc(messages.id))
    : [];
  const mems = relIds.length
    ? await db
        .select({ fact: memories.fact, learnedAt: memories.learnedAt })
        .from(memories)
        .where(and(inArray(memories.relId, relIds), eq(memories.userVisible, true), isNull(memories.deletedAt)))
        .orderBy(asc(memories.learnedAt))
    : [];
  const reacts = await db
    .select({ msgId: reactions.msgId, by: reactions.by, emoji: reactions.emoji, at: reactions.at })
    .from(reactions)
    .where(and(eq(reactions.userId, userId), lte(reactions.at, now)))
    .orderBy(asc(reactions.at));
  const evs = await db.select({ kind: events.kind, at: events.at, meta: events.meta }).from(events).where(eq(events.userId, userId)).orderBy(asc(events.at));
  return {
    exportedAt: now.toISOString(),
    user: u ?? null,
    relationships: rels.map(({ id: _id, ...r }) => r),
    messages: msgs.map(({ relId: _relId, ...m }) => m),
    memories: mems,
    reactions: reacts,
    events: evs,
  };
}
