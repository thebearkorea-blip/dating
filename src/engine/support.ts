// 문의·답장 신고·연타 제한(W4). 새 테이블 없이 events·messages를 쓴다.
import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { messages, relationships } from "../db/schema/index";
import { recordEvent } from "./events.js";

export const SUPPORT_CATEGORIES = ["account", "billing", "bug", "safety", "other"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
export const SUPPORT_MAX_TEXT = 2000;

export const REPORT_REASONS = ["inappropriate", "hurtful", "out_of_character", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** 사용자가 60초에 보낼 수 있는 메시지 수. 이미 이만큼 보냈으면 다음 전송은 거절한다. */
export const BURST_LIMIT = 10;
export const BURST_WINDOW_MS = 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitSupportRequest(db: Db, userId: string, category: unknown, text: unknown, now?: Date): Promise<"ok" | "invalid" | "failed"> {
  if (typeof category !== "string" || !(SUPPORT_CATEGORIES as readonly string[]).includes(category)) return "invalid";
  const body = typeof text === "string" ? text.trim() : "";
  if (!body || body.length > SUPPORT_MAX_TEXT) return "invalid";
  return (await recordEvent(db, userId, "support_request", { meta: { category, text: body }, now })) ? "ok" : "failed";
}

/** 그의 도착한 메시지이고 내 관계의 것일 때만 신고를 기록한다. 대화에는 아무 영향이 없다. */
export async function reportReply(db: Db, userId: string, msgId: unknown, reason: unknown, now: Date): Promise<"ok" | "invalid" | "not_found" | "failed"> {
  if (typeof msgId !== "string" || !UUID.test(msgId)) return "invalid";
  if (typeof reason !== "string" || !(REPORT_REASONS as readonly string[]).includes(reason)) return "invalid";
  const [m] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(relationships, eq(relationships.id, messages.relId))
    .where(and(eq(messages.id, msgId), eq(relationships.userId, userId), eq(messages.sender, "char"), sql`${messages.deliverAt} <= ${now}`))
    .limit(1);
  if (!m) return "not_found";
  return (await recordEvent(db, userId, "reply_reported", { meta: { msgId, reason }, now })) ? "ok" : "failed";
}

/** 최근 60초 안에 이 사용자가 보낸 메시지 수(자기 관계의 것만). */
export async function recentUserMessageCount(db: Db, userId: string, now: Date): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(relationships, eq(relationships.id, messages.relId))
    .where(and(eq(relationships.userId, userId), eq(messages.sender, "user"), gt(messages.at, new Date(now.getTime() - BURST_WINDOW_MS))));
  return r?.n ?? 0;
}
