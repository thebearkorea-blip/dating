// /admin 집계. 서버 컴포넌트가 부르는 읽기 전용 쿼리(숫자는 여기서만 만든다).
import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { entitlements, events, llmUsage, messages, ratings, relationships, reviewFindings, users } from "../db/schema/index";

// ---- 퍼널 ----
export interface FunnelStep {
  key: "signup" | "first_message" | "day3_return" | "subscribe";
  label: string;
  count: number;
  /** 직전 단계 대비(0이면 null) */
  fromPrev: number | null;
  /** 가입 대비(0이면 null) */
  fromSignup: number | null;
}

const STEPS: { key: FunnelStep["key"]; label: string }[] = [
  { key: "signup", label: "가입" },
  { key: "first_message", label: "첫 대화" },
  { key: "day3_return", label: "3일 잔존" },
  { key: "subscribe", label: "유료" },
];

/** 이벤트별 사용자 수 → 단계별 숫자·전환율(순수). */
export function computeFunnel(counts: Partial<Record<FunnelStep["key"], number>>): FunnelStep[] {
  const signup = counts.signup ?? 0;
  return STEPS.map((s, i) => {
    const count = counts[s.key] ?? 0;
    const prev = i === 0 ? null : (counts[STEPS[i - 1]!.key] ?? 0);
    return {
      ...s,
      count,
      fromPrev: prev === null || prev === 0 ? null : count / prev,
      fromSignup: i === 0 || signup === 0 ? null : count / signup,
    };
  });
}

/** 이벤트 종류별 고유 사용자 수(invite_link_open은 행 수: 가입 전이라 사용자가 없을 수 있다). */
export async function eventCounts(db: Db): Promise<Record<string, number>> {
  const rows = await db
    .select({ kind: events.kind, users: sql<number>`count(distinct ${events.userId})::int`, rows: sql<number>`count(*)::int` })
    .from(events)
    .groupBy(events.kind);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.kind] = r.kind === "invite_link_open" ? r.rows : r.users;
  return out;
}

export async function funnel(db: Db): Promise<{ steps: FunnelStep[]; extra: Record<string, number> }> {
  const c = await eventCounts(db);
  return { steps: computeFunnel(c), extra: c };
}

// ---- 평가 ----
export interface RatingRow {
  id: string;
  score: number;
  note: string | null;
  at: Date;
  messageText: string;
  prevUserText: string | null;
  stage: number;
}

/** 👎 우선, 그 안에서 최신순. */
export async function ratingRows(db: Db, limit = 100): Promise<RatingRow[]> {
  const rows = await db
    .select({
      id: ratings.id,
      score: ratings.score,
      note: ratings.note,
      at: ratings.at,
      messageText: messages.text,
      messageAt: messages.at,
      relId: messages.relId,
      stage: relationships.stage,
    })
    .from(ratings)
    .innerJoin(messages, eq(messages.id, ratings.msgId))
    .innerJoin(relationships, eq(relationships.id, messages.relId))
    .orderBy(sql`${ratings.score} asc`, desc(ratings.at))
    .limit(limit);
  const out: RatingRow[] = [];
  for (const r of rows) {
    const [prev] = await db
      .select({ text: messages.text })
      .from(messages)
      .where(and(eq(messages.relId, r.relId), eq(messages.sender, "user"), lt(messages.at, r.messageAt)))
      .orderBy(desc(messages.at))
      .limit(1);
    out.push({ id: r.id, score: r.score, note: r.note, at: r.at, messageText: r.messageText, prevUserText: prev?.text ?? null, stage: r.stage });
  }
  return out;
}

// ---- 검수 ----
export async function reviewSummary(db: Db) {
  const recent = await db
    .select({ id: reviewFindings.id, ruleId: reviewFindings.ruleId, severity: reviewFindings.severity, quote: reviewFindings.quote, reason: reviewFindings.reason, at: reviewFindings.createdAt })
    .from(reviewFindings)
    .orderBy(desc(reviewFindings.createdAt))
    .limit(100);
  const byRule = await db
    .select({ ruleId: reviewFindings.ruleId, n: sql<number>`count(*)::int` })
    .from(reviewFindings)
    .groupBy(reviewFindings.ruleId)
    .orderBy(sql`count(*) desc`);
  return { recent, byRule };
}

// ---- 비용 ----
export async function costSummary(db: Db, from: Date, to: Date) {
  const range = and(sql`${llmUsage.at} >= ${from}`, sql`${llmUsage.at} < ${to}`);
  const byPurposeModel = await db
    .select({
      purpose: llmUsage.purpose,
      model: llmUsage.model,
      calls: sql<number>`count(*)::int`,
      input: sql<number>`coalesce(sum(${llmUsage.input}), 0)::int`,
      output: sql<number>`coalesce(sum(${llmUsage.output}), 0)::int`,
      cost: sql<number>`coalesce(sum(${llmUsage.costUsd}), 0)::float8`,
    })
    .from(llmUsage)
    .where(range)
    .groupBy(llmUsage.purpose, llmUsage.model)
    .orderBy(llmUsage.purpose, llmUsage.model);
  const monthly = await db
    .select({
      month: sql<string>`to_char(${llmUsage.at} at time zone 'Asia/Seoul', 'YYYY-MM')`,
      cost: sql<number>`coalesce(sum(${llmUsage.costUsd}), 0)::float8`,
      users: sql<number>`count(distinct ${llmUsage.userId})::int`,
    })
    .from(llmUsage)
    .where(range)
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return {
    byPurposeModel,
    total: byPurposeModel.reduce((a, r) => a + r.cost, 0),
    monthly: monthly.map((m) => ({ ...m, perUser: m.users > 0 ? m.cost / m.users : null })),
  };
}

// ---- 사용자 ----
export async function userRows(db: Db, limit = 200) {
  const rows = await db
    .select({
      id: users.id,
      name: users.displayName,
      createdAt: users.createdAt,
      isBeta: users.isBeta,
      plan: entitlements.plan,
      stage: relationships.stage,
      lastActive: sql<Date | null>`(select max(m.at) from personal.messages m where m.rel_id = ${relationships.id} and m.sender = 'user')`,
    })
    .from(users)
    .leftJoin(entitlements, eq(entitlements.userId, users.id))
    .leftJoin(relationships, and(eq(relationships.userId, users.id), eq(relationships.characterId, "ihan")))
    .orderBy(desc(users.createdAt))
    .limit(limit);
  // 최근 활동 순(활동 없는 사용자는 뒤).
  return rows
    .map((r) => ({ ...r, lastActive: r.lastActive ? new Date(r.lastActive) : null }))
    .sort((a, b) => (b.lastActive?.getTime() ?? 0) - (a.lastActive?.getTime() ?? 0));
}
