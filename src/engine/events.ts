// 지표 이벤트 기록. 퍼널(가입→첫 대화→3일 잔존→유료)은 personal.events로만 계산한다.
// 기록 실패는 본 흐름을 막지 않는다(삼킨다).
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { events } from "../db/schema/index";
import { kstParts } from "./schedule.js";

export const EVENT_KINDS = [
  "signup",
  "first_message",
  "day3_return",
  "quota_exhausted",
  "paywall_shown",
  "subscribe",
  "cancel",
  "invite_link_open",
  "breakup",
  "reconcile",
  "account_deleted",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

const DAY_MS = 86_400_000;

/** once: "ever"는 사용자당 1회, "day"는 KST 하루 1회. 없으면 매번 기록. 기록했으면 true. */
export async function recordEvent(
  db: Db,
  userId: string | null,
  kind: EventKind,
  opts: { meta?: Record<string, unknown>; once?: "ever" | "day"; now?: Date } = {},
): Promise<boolean> {
  try {
    const now = opts.now ?? new Date();
    if (opts.once && userId) {
      const conds = [eq(events.userId, userId), eq(events.kind, kind)];
      if (opts.once === "day") {
        const day = kstParts(now).date;
        conds.push(sql`to_char(${events.at} at time zone 'Asia/Seoul', 'YYYY-MM-DD') = ${day}`);
      }
      const [hit] = await db.select({ id: events.id }).from(events).where(and(...conds)).limit(1);
      if (hit) return false;
    }
    await db.insert(events).values({ userId, kind, at: now, meta: opts.meta ?? null });
    return true;
  } catch {
    return false;
  }
}

/** 가입 3일 이후 첫 접속 1회. */
export async function maybeDay3Return(db: Db, user: { id: string; createdAt: Date }, now: Date): Promise<boolean> {
  if (now.getTime() - user.createdAt.getTime() < 3 * DAY_MS) return false;
  return recordEvent(db, user.id, "day3_return", { once: "ever", now });
}
