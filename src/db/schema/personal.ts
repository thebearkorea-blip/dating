import {
  boolean,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { characters } from "./world";

export const personal = pgSchema("personal");

export const users = personal.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  city: text("city"),
  tz: text("tz"),
  birthYear: integer("birth_year"),
  birthYearVerified: boolean("birth_year_verified").notNull().default(false),
  ageBand: text("age_band"), // 14-17 | 18+
  aiNoticeAcceptedAt: timestamp("ai_notice_accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const relationships = personal.table(
  "relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    characterId: text("character_id").notNull().references(() => characters.id),
    mode: text("mode").notNull(), // fan | romance
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    stage: integer("stage").notNull().default(1),
    /** 숨김. 어떤 화면·응답에도 싣지 않는다. */
    affection: integer("affection").notNull().default(0),
    sulkState: text("sulk_state").notNull().default("none"),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    pushWindow: jsonb("push_window"),
    pushMax: integer("push_max"),
    profile: jsonb("profile"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** 기억 추출이 처리한 마지막 사용자 메시지 시각 */
    memoryCursorAt: timestamp("memory_cursor_at", { withTimezone: true }),
    /** 숨김. 일 상한 계산용(KST 날짜·그날 오른 양) */
    affectionDay: text("affection_day"),
    affectionDayGain: integer("affection_day_gain").notNull().default(0),
    /** 일 배치(감쇠)를 마지막으로 돈 KST 날짜. 같은 날 두 번 깎지 않는다. */
    affectionTickedOn: text("affection_ticked_on"),
    /** 현재 토라짐 상태가 시작된 시각(mild·sulking은 진입 시각, thawing은 풀리기 시작한 시각) */
    sulkSince: timestamp("sulk_since", { withTimezone: true }),
    /** 그가 선톡으로 제안한 약속의 시각. 사용자가 답하면 비운다. */
    promiseAt: timestamp("promise_at", { withTimezone: true }),
    /** 감지된 relationship_breakers id(B1~B4). 확인 질문 응답을 기다리는 중. */
    pendingBreaker: text("pending_breaker"),
    /** 단계 상승으로 해금돼 아직 말하지 않은 비밀 id */
    pendingSecret: text("pending_secret"),
    reconcileAfter: timestamp("reconcile_after", { withTimezone: true }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    /** 2층 프로필 제안 누적({n, playfulness, initiative, directness, weakness_shown}, 0~1 평균) */
    profileSuggestions: jsonb("profile_suggestions"),
    /** profile이 확정된 시각. 이후 불변. */
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
  },
  (t) => [unique("relationships_user_character_uq").on(t.userId, t.characterId)],
);

export const messages = personal.table("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  relId: uuid("rel_id").notNull().references(() => relationships.id),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  sender: text("sender").notNull(), // user | char | member
  text: text("text").notNull(),
  mediaId: text("media_id"),
  ttsUrl: text("tts_url"),
  origin: text("origin"), // reply | proactive | catchup
  tag: text("tag"), // promise | reward (선톡 분류용, 화면에 싣지 않음)
  /** 이 시각 전에는 화면에 내보내지 않는다(사람다운 답장 지연). 사용자 메시지는 at과 같다. */
  deliverAt: timestamp("deliver_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 검수·감지 로그(차단·플래그·relationship_breakers 감지). 화면에 싣지 않는다. */
export const reviewFindings = personal.table("review_findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  relId: uuid("rel_id").notNull().references(() => relationships.id),
  messageId: uuid("message_id"),
  ruleId: text("rule_id").notNull(),
  severity: text("severity").notNull(), // block | flag
  quote: text("quote").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memories = personal.table("memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  relId: uuid("rel_id").notNull().references(() => relationships.id),
  fact: text("fact").notNull(),
  learnedAt: timestamp("learned_at", { withTimezone: true }).notNull().defaultNow(),
  sourceMsgId: uuid("source_msg_id"),
  userVisible: boolean("user_visible").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** 토큰 링크(/i/[token])용 선생성 행. 가입 완료 시 userId가 채워진다. */
export const platformIdentities = personal.table("platform_identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull(),
  handle: text("handle").notNull(),
  userId: uuid("user_id").references(() => users.id),
  seedMemory: text("seed_memory"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
});

/** Web Push 구독(브라우저당 1행). endpoint가 유일 키. */
export const pushSubscriptions = personal.table("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 이미 털어놓은 비밀(bible secrets id). 같은 비밀을 두 번 말하지 않는다. */
export const disclosures = personal.table(
  "disclosures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relId: uuid("rel_id").notNull().references(() => relationships.id),
    secretId: text("secret_id").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("disclosures_rel_secret_uq").on(t.relId, t.secretId)],
);
