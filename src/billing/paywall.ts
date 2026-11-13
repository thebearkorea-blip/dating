// 아침 유료 안내 판정. 한도를 다 쓴 다음 날 KST 아침, 오늘 첫 /chat 진입 때 1회만.
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { entitlements } from "../db/schema/billing";
import { kstParts } from "../engine/schedule.js";
import { recordEvent } from "../engine/events.js";
import { expireIfDue } from "../engine/quota.js";

/** 보여 줘야 하면 true를 돌려주고 오늘 표시로 기록한다(두 번째 호출부터 false).
 * PAYWALL_FORCE=1이면 플랜·소진 조건을 무시한다(오늘 이미 표시했으면 여전히 1회 상한). */
export async function takePaywall(db: Db, userId: string, now: Date, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  await expireIfDue(db, userId, now);
  const [row] = await db.select().from(entitlements).where(eq(entitlements.userId, userId)).limit(1);
  const today = kstParts(now).date;
  const force = env.PAYWALL_FORCE === "1";
  if (!row && !force) return false;
  if (row?.paywallShownDay === today) return false;
  if (!force) {
    if (!row || row.plan !== "free" || !row.quotaExhaustedAt) return false;
    const yesterday = kstParts(new Date(now.getTime() - 86_400_000)).date;
    if (kstParts(row.quotaExhaustedAt).date !== yesterday) return false;
  }
  if (!row) {
    await db.insert(entitlements).values({ userId, plan: "free", dailyQuota: 5, paywallShownDay: today }).onConflictDoNothing();
    await recordEvent(db, userId, "paywall_shown", { now });
    return true;
  }
  // 동시 요청이 와도 한 번만 이기도록 조건부 갱신으로 선점한다.
  const claimed = await db
    .update(entitlements)
    .set({ paywallShownDay: today })
    .where(and(eq(entitlements.userId, userId), sql`${entitlements.paywallShownDay} is distinct from ${today}`))
    .returning({ userId: entitlements.userId });
  if (claimed.length > 0) await recordEvent(db, userId, "paywall_shown", { now });
  return claimed.length > 0;
}
