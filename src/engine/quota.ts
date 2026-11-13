// 하루 대화 한도. 무료 5회 기본값, KST 자정 리셋. 테스트용 env DAILY_QUOTA_OVERRIDE가 있으면 그 값이 이긴다.
import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { entitlements } from "../db/schema/index";
import { kstParts } from "./schedule.js";

export const FREE_DAILY_QUOTA = 5;

function limitOf(rowQuota: number): number {
  const o = Number(process.env.DAILY_QUOTA_OVERRIDE);
  return process.env.DAILY_QUOTA_OVERRIDE && Number.isInteger(o) && o >= 0 ? o : rowQuota;
}

/** 한도 1회분을 소비한다. 남아 있으면 true, 소진이면 false(LLM을 부르면 안 된다). */
export async function consumeQuota(db: Db, userId: string, now: Date): Promise<boolean> {
  const today = kstParts(now).date;
  await db
    .insert(entitlements)
    .values({ userId, plan: "free", dailyQuota: FREE_DAILY_QUOTA, quotaUsedToday: 0, quotaDay: today })
    .onConflictDoNothing();
  const [row] = await db.select().from(entitlements).where(eq(entitlements.userId, userId)).limit(1);
  if (!row) return false;
  if (row.quotaDay !== today) {
    await db
      .update(entitlements)
      .set({ quotaUsedToday: 0, quotaDay: today, quotaExhaustedAt: null })
      .where(eq(entitlements.userId, userId));
  }
  const limit = limitOf(row.dailyQuota);
  const [taken] = await db
    .update(entitlements)
    .set({ quotaUsedToday: sql`${entitlements.quotaUsedToday} + 1` })
    .where(and(eq(entitlements.userId, userId), lt(entitlements.quotaUsedToday, limit)))
    .returning({ used: entitlements.quotaUsedToday });
  if (!taken) {
    await db.update(entitlements).set({ quotaExhaustedAt: now }).where(eq(entitlements.userId, userId));
    return false;
  }
  return true;
}
