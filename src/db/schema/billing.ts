import { integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const billing = pgSchema("billing");

/** 개인 층에만 효용을 준다(하루 한도·통화 크레딧). user_id는 personal.users를 가리키지만 FK는 걸지 않는다(스키마 격리). */
export const entitlements = billing.table("entitlements", {
  userId: uuid("user_id").primaryKey(),
  plan: text("plan").notNull().default("free"),
  dailyQuota: integer("daily_quota").notNull().default(0),
  quotaUsedToday: integer("quota_used_today").notNull().default(0),
  quotaExhaustedAt: timestamp("quota_exhausted_at", { withTimezone: true }),
  callCredits: integer("call_credits").notNull().default(0),
});
