// 정의만(첫 출시에서는 쓰지 않음). votes에는 가중치 열이 없고 plan별 집계 열도 없다(전체구조 §2.5-2).
import { date, integer, jsonb, pgSchema, primaryKey, text, uuid, real } from "drizzle-orm/pg-core";

export const collective = pgSchema("collective");

export const votes = collective.table(
  "votes",
  {
    userId: uuid("user_id").notNull(),
    eventId: text("event_id").notNull(),
    choice: text("choice").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId] })],
);

export const voteTallies = collective.table(
  "vote_tallies",
  {
    eventId: text("event_id").notNull(),
    choice: text("choice").notNull(),
    n: integer("n").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.choice] })],
);

export const activityDaily = collective.table("activity_daily", {
  date: date("date").primaryKey(),
  activeUsers: integer("active_users").notNull().default(0),
  messages: integer("messages").notNull().default(0),
  feedViews: integer("feed_views").notNull().default(0),
});

export const growthState = collective.table("growth_state", {
  id: integer("id").primaryKey().default(1),
  currentRelDay: integer("current_rel_day").notNull(),
  speed: real("speed").notNull().default(1),
  pendingBeats: jsonb("pending_beats").notNull().default([]),
});
