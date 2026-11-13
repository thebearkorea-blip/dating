// 사용자 데이터 삭제(체크리스트 7). 대화만 지우기 / 계정 전체 삭제.
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { disclosures, events, memories, messages, platformIdentities, pushSubscriptions, ratings, relationships, reviewFindings, users } from "../db/schema/index";
import { recordEvent } from "./events.js";

async function wipeConversations(db: Db, userId: string): Promise<string[]> {
  const relIds = (await db.select({ id: relationships.id }).from(relationships).where(eq(relationships.userId, userId))).map((r) => r.id);
  await db.delete(ratings).where(eq(ratings.userId, userId));
  if (relIds.length > 0) {
    await db.delete(memories).where(inArray(memories.relId, relIds));
    await db.delete(disclosures).where(inArray(disclosures.relId, relIds));
    await db.delete(reviewFindings).where(inArray(reviewFindings.relId, relIds));
    await db.delete(messages).where(inArray(messages.relId, relIds));
  }
  return relIds;
}

/** messages·memories·disclosures·ratings(와 검수 로그)를 지우고 관계는 유지한 채 stage 1로 되돌린다. */
export async function deleteAllConversations(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const relIds = await wipeConversations(tx as unknown as Db, userId);
    if (relIds.length === 0) return;
    await tx
      .update(relationships)
      .set({
        stage: 1,
        affection: 0,
        sulkState: "none",
        sulkSince: null,
        lastContactAt: null,
        memoryCursorAt: null,
        affectionDay: null,
        affectionDayGain: 0,
        promiseAt: null,
        pendingBreaker: null,
        pendingSecret: null,
        reconcileAfter: null,
        reconciledAt: null,
        profile: null,
        profileSuggestions: null,
        frozenAt: null,
      })
      .where(inArray(relationships.id, relIds));
  });
}

/** 사용자와 종속 행을 모두 지운다. 삭제 사실만 user_id null 이벤트로 남긴다. */
export async function deleteAccount(db: Db, userId: string, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    await wipeConversations(t, userId);
    await t.delete(relationships).where(eq(relationships.userId, userId));
    await t.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    await t.delete(platformIdentities).where(eq(platformIdentities.userId, userId));
    await t.delete(events).where(eq(events.userId, userId));
    await t.delete(users).where(eq(users.id, userId));
  });
  await recordEvent(db, null, "account_deleted", { now });
}
