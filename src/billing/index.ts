import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { entitlements } from "../db/schema/billing";
import { expireIfDue } from "../engine/quota.js";
import { assertDevOnly } from "../dev-only.js";
import { mockProvider } from "./mock.js";
import type { BillingProvider } from "./provider.js";
import { stripeProvider } from "./stripe.js";

export type { BillingProvider } from "./provider.js";

/** 프로덕션은 Stripe, 그 밖에는 mock. mock을 프로덕션에서 고르면 dev-only 가드가 예외를 던진다. */
export function getBillingProvider(db: Db, env: Record<string, string | undefined> = process.env): BillingProvider {
  if (env.NODE_ENV === "production") return stripeProvider;
  assertDevOnly("mock billing", env);
  return mockProvider(db);
}

export interface PlanView {
  plan: "free" | "paid";
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** /settings 표시용 플랜(기간이 끝난 취소 건은 free로 읽힌다). */
export async function getPlanView(db: Db, userId: string, now: Date): Promise<PlanView> {
  await expireIfDue(db, userId, now);
  const [row] = await db.select().from(entitlements).where(eq(entitlements.userId, userId)).limit(1);
  if (!row || row.plan !== "paid") return { plan: "free", periodEnd: null, cancelAtPeriodEnd: false };
  return { plan: "paid", periodEnd: row.currentPeriodEnd, cancelAtPeriodEnd: row.cancelAtPeriodEnd };
}
