// /admin 몰입 지표: 가입 코호트 주별 1일·7일 재방문율, 선톡 24시간 답장률, "봇 같다" 발화 수.
// 제외: users.is_admin(운영자)만. 이 단계에서는 베타 테스터가 실제 초기 사용자라 포함한다.
// 사용자 시간대 기준 날짜(users.tz, 없으면 Asia/Seoul)로 가입일 대비 며칠째인지 센다.
import { eq, gte } from "drizzle-orm";
import type { Db } from "../db/client";
import { events, messages, relationships, users } from "../db/schema/index";
import { safeTz } from "../product";

const DAY = 86_400_000;
const localDate = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
const dayNum = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`) / DAY;

export interface RetentionUser {
  id: string;
  tz: string | null;
  createdAt: Date;
  isAdmin: boolean;
  isBeta: boolean;
}
export interface Rate {
  n: number;
  hit: number;
  rate: number | null;
}
export interface RetentionRow {
  /** 가입 주(월요일 날짜, 사용자 시간대 기준) */
  cohort: string;
  d1: Rate;
  d7: Rate;
}

const rate = (hit: number, n: number): Rate => ({ n, hit, rate: n === 0 ? null : hit / n });

/** 1일 = 가입 후 1~2일째 app_open, 7일 = 6~8일째. 분모: 1일은 가입 3일 이상, 7일은 8일 이상 지난 사용자. */
export function computeRetention(us: RetentionUser[], opens: { userId: string; at: Date }[], now: Date): RetentionRow[] {
  const byUser = new Map<string, Date[]>();
  for (const o of opens) byUser.set(o.userId, [...(byUser.get(o.userId) ?? []), o.at]);
  const cohorts = new Map<string, { d1: [number, number]; d7: [number, number] }>();
  for (const u of us) {
    if (u.isAdmin) continue;
    const tz = safeTz(u.tz);
    const signup = dayNum(localDate(u.createdAt, tz));
    const idx = (byUser.get(u.id) ?? []).map((a) => dayNum(localDate(a, tz)) - signup);
    const week = new Date((signup - ((signup + 3) % 7)) * DAY).toISOString().slice(0, 10); // 1970-01-01=목 → 월요일 시작
    const c = cohorts.get(week) ?? { d1: [0, 0], d7: [0, 0] };
    const age = now.getTime() - u.createdAt.getTime();
    if (age >= 3 * DAY) {
      c.d1[1]++;
      if (idx.some((i) => i >= 1 && i <= 2)) c.d1[0]++;
    }
    if (age >= 8 * DAY) {
      c.d7[1]++;
      if (idx.some((i) => i >= 6 && i <= 8)) c.d7[0]++;
    }
    cohorts.set(week, c);
  }
  return [...cohorts.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([cohort, c]) => ({ cohort, d1: rate(c.d1[0], c.d1[1]), d7: rate(c.d7[0], c.d7[1]) }));
}

export const BOT_KEYWORDS = [
  // en
  "bot", "robot", "ai response", "chatbot", "scripted", "canned",
  // ja
  "ボット", "ロボット", "機械みたい", "機械的", "AIっぽい", "テンプレ",
  // ko
  "봇 같", "봇같", "기계 같", "기계같", "로봇 같", "로봇같", "ai 같", "챗봇",
];

export function isBotLike(text: string): boolean {
  const t = text.toLowerCase();
  return BOT_KEYWORDS.some((k) => (/^[a-z ]+$/.test(k) ? new RegExp(`\\b${k}\\b`).test(t) : t.includes(k.toLowerCase())));
}

export interface ImmersionMetrics {
  retention: RetentionRow[];
  proactive: Rate;
  botLike: number;
}

export async function immersionMetrics(db: Db, now: Date): Promise<ImmersionMetrics> {
  const us = await db
    .select({ id: users.id, tz: users.tz, createdAt: users.createdAt, isAdmin: users.isAdmin, isBeta: users.isBeta })
    .from(users);
  const real = new Set(us.filter((u) => !u.isAdmin).map((u) => u.id));
  const opens = (await db.select({ userId: events.userId, at: events.at }).from(events).where(eq(events.kind, "app_open"))).flatMap((o) =>
    o.userId ? [{ userId: o.userId, at: o.at }] : [],
  );
  const retention = computeRetention(us, opens, now);

  // 선톡 24시간 답장률: 선톡 전달 후 24시간이 지난 것(최근 30일)만 센다.
  const msgs = await db
    .select({ relId: messages.relId, userId: relationships.userId, sender: messages.sender, origin: messages.origin, at: messages.at, deliverAt: messages.deliverAt, text: messages.text })
    .from(messages)
    .innerJoin(relationships, eq(relationships.id, messages.relId))
    .where(gte(messages.at, new Date(now.getTime() - 31 * DAY)));
  const userMsgAts = new Map<string, number[]>();
  for (const m of msgs) if (m.sender === "user" && real.has(m.userId)) userMsgAts.set(m.relId, [...(userMsgAts.get(m.relId) ?? []), m.at.getTime()]);
  let n = 0;
  let hit = 0;
  for (const m of msgs) {
    if (m.sender !== "char" || m.origin !== "proactive" || !real.has(m.userId)) continue;
    const t = m.deliverAt.getTime();
    if (t < now.getTime() - 30 * DAY || t > now.getTime() - DAY) continue;
    n++;
    if ((userMsgAts.get(m.relId) ?? []).some((a) => a > t && a <= t + DAY)) hit++;
  }

  const since = now.getTime() - 7 * DAY;
  const botLike = msgs.filter((m) => m.sender === "user" && real.has(m.userId) && m.at.getTime() >= since && isBotLike(m.text)).length;
  return { retention, proactive: rate(hit, n), botLike };
}
