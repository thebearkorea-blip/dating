import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { entitlements } from "../db/schema/billing";
import { expireIfDue } from "../engine/quota.js";
import { assertDevOnly } from "../dev-only.js";
import { mockProvider } from "./mock.js";
import type { BillingProvider } from "./provider.js";
import { createStripeProvider } from "./stripe.js";

export type { BillingProvider } from "./provider.js";

/** STRIPE_SECRET_KEY가 있으면 Stripe, 없고 프로덕션이면 Stripe(호출 시 미설정 오류), 없고 dev면 mock. */
export function getBillingProvider(db: Db, env: Record<string, string | undefined> = process.env): BillingProvider {
  if (env.STRIPE_SECRET_KEY || env.NODE_ENV === "production") return createStripeProvider(db);
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
