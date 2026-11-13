import { boolean, doublePrecision, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const billing = pgSchema("billing");

/** 개인 층에만 효용을 준다(하루 한도·통화 크레딧). user_id는 personal.users를 가리키지만 FK는 걸지 않는다(스키마 격리). */
export const entitlements = billing.table("entitlements", {
  userId: uuid("user_id").primaryKey(),
  plan: text("plan").notNull().default("free"),
  dailyQuota: integer("daily_quota").notNull().default(0),
  quotaUsedToday: integer("quota_used_today").notNull().default(0),
  /** quota_used_today가 속한 KST 날짜(YYYY-MM-DD). 날짜가 바뀌면 0으로 리셋 */
  quotaDay: text("quota_day"),
  quotaExhaustedAt: timestamp("quota_exhausted_at", { withTimezone: true }),
  /** 유료 기간 끝. 취소(cancel_at_period_end)한 뒤 이 시각이 지나면 quota.ts가 읽을 때 free로 되돌린다 */
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  /** 아침 유료 안내를 마지막으로 보여 준 KST 날짜(YYYY-MM-DD). 하루 1회 상한 */
  paywallShownDay: text("paywall_shown_day"),
  callCredits: integer("call_credits").notNull().default(0),
});

/** LLM 호출 사용량·비용(원가 실측). FK는 걸지 않는다(스키마 격리). */
export const llmUsage = billing.table("llm_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  relId: uuid("rel_id"),
  userId: uuid("user_id"),
  purpose: text("purpose").notNull(), // chat | judge | proactive | memory | review
  model: text("model").notNull(),
  input: integer("input").notNull().default(0),
  output: integer("output").notNull().default(0),
  cacheRead: integer("cache_read").notNull().default(0),
  costUsd: doublePrecision("cost_usd").notNull().default(0),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
