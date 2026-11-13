// 개발 전용 mock 결제. 출시 금지(프로덕션에서는 getBillingProvider가 막는다).
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { entitlements } from "../db/schema/billing";
import { recordEvent } from "../engine/events.js";
import { PAID_DAILY_QUOTA, PAID_PERIOD_DAYS, type BillingProvider } from "./provider.js";

const DAY_MS = 86_400_000;

export async function mockSubscribe(db: Db, userId: string, now: Date): Promise<void> {
  const paid = {
    plan: "paid",
    dailyQuota: PAID_DAILY_QUOTA,
    currentPeriodEnd: new Date(now.getTime() + PAID_PERIOD_DAYS * DAY_MS),
    cancelAtPeriodEnd: false,
  };
  await db
    .insert(entitlements)
    .values({ userId, ...paid })
    .onConflictDoUpdate({ target: entitlements.userId, set: paid });
  await recordEvent(db, userId, "subscribe", { now });
}

export async function mockCancel(db: Db, userId: string): Promise<void> {
  await db.update(entitlements).set({ cancelAtPeriodEnd: true }).where(eq(entitlements.userId, userId));
  await recordEvent(db, userId, "cancel");
}

export function mockProvider(db: Db): BillingProvider {
  return {
    async createCheckout() {
      return { url: "/billing/mock-checkout" };
    },
    async handleWebhook() {
      return { handled: false };
    },
    async cancel(userId) {
      await mockCancel(db, userId);
    },
  };
}
