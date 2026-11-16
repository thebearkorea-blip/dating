// 메시지 반응(W9 사용자 반응·W11 그의 반응)과 답장 생성 문맥(반응·인용, W9·W10). 서버 전용.
import { and, asc, desc, eq, gt, inArray, isNotNull, lt, lte } from "drizzle-orm";
import type { Db } from "../db/client";
import { media, messages, reactions } from "../db/schema/index";
import { findOwnedRelationship, isUuid, visible } from "./chat-view.js";
import { BUSY_REACTION, isCharReaction, isUserReaction } from "./reaction-emoji.js";
import { hash32 } from "./schedule.js";

export type SetReactionResult = "ok" | "invalid" | "not_found";

/**
 * 사용자 반응 1개(메시지당 by='user' 1행). emoji=null이면 지운다.
 * 대상은 호출자 관계의, 이미 도착한, 그(char)가 보낸 메시지만. 허용 목록 밖 emoji는 거부.
 */
export async function setUserReaction(db: Db, userId: string, msgId: string, emoji: string | null, now: Date): Promise<SetReactionResult> {
  if (emoji !== null && !isUserReaction(emoji)) return "invalid";
  if (typeof msgId !== "string" || !isUuid(msgId)) return "not_found";
  const rel = await findOwnedRelationship(db, userId);
  if (!rel) return "not_found";
  const [m] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(visible(rel.id, now), eq(messages.id, msgId), eq(messages.sender, "char")))
    .limit(1);
  if (!m) return "not_found";
  if (emoji === null) {
    await db.delete(reactions).where(and(eq(reactions.msgId, m.id), eq(reactions.by, "user")));
    return "ok";
  }
  await db
    .insert(reactions)
    .values({ msgId: m.id, userId, by: "user", emoji, at: now })
    .onConflictDoUpdate({ target: [reactions.msgId, reactions.by], set: { emoji, at: now } });
  return "ok";
}

/** 인용 대상 검사: 같은 관계의 이미 도착한 메시지면 true. */
export async function isQuotable(db: Db, relId: string, msgId: string, now: Date): Promise<boolean> {
  if (!isUuid(msgId)) return false;
  const [m] = await db.select({ id: messages.id }).from(messages).where(and(visible(relId, now), eq(messages.id, msgId))).limit(1);
  return !!m;
}

// ---------- 답장 생성 문맥 ----------

const QUOTE_MAX = 200;
const clip = (s: string): string => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > QUOTE_MAX ? `${flat.slice(0, QUOTE_MAX)}…` : flat;
};

/** world.media.tags({situation, place, time_of_day})를 한 줄 설명으로. */
export function describePhoto(tags: unknown): string {
  const t = (tags ?? {}) as Record<string, unknown>;
  const parts = [
    typeof t.situation === "string" ? `situation: ${t.situation}` : null,
    typeof t.place === "string" ? `place: ${t.place}` : null,
    typeof t.time_of_day === "string" ? `time of day: ${t.time_of_day}` : null,
  ].filter(Boolean);
  return parts.length ? `(${parts.join(", ")})` : "";
}

async function photoDescriptions(db: Db, mediaIds: string[]): Promise<Map<string, string>> {
  if (mediaIds.length === 0) return new Map();
  const rows = await db.select({ id: media.id, tags: media.tags }).from(media).where(inArray(media.id, mediaIds));
  return new Map(rows.map((r) => [r.id, describePhoto(r.tags)]));
}

/** 그의 메시지(사진일 수 있음)를 문맥 한 조각으로. */
function target(m: { sender: string; text: string; mediaId: string | null }, photos: Map<string, string>): string {
  const whose = m.sender === "user" ? "her own" : "your";
  if (m.mediaId) {
    const desc = photos.get(m.mediaId) ?? "";
    return `${whose} photo${desc ? ` ${desc}` : ""}${m.text.trim() ? ` captioned "${clip(m.text)}"` : ""}`;
  }
  return m.sender === "user" ? `her own message "${clip(m.text)}"` : `"${clip(m.text)}"`;
}

/**
 * 그의 마지막 도착 답장 이후 사용자가 단 반응·인용 답장을 문맥 줄로. 없으면 빈 배열.
 * upTo: 이번 답장이 답하는 사용자 메시지의 at(그 뒤 메시지는 넣지 않는다).
 */
export async function replyContextLines(db: Db, relId: string, upTo: Date, now: Date): Promise<string[]> {
  const [lastChar] = await db
    .select({ at: messages.deliverAt })
    .from(messages)
    .where(and(eq(messages.relId, relId), eq(messages.sender, "char"), lte(messages.deliverAt, now)))
    .orderBy(desc(messages.deliverAt))
    .limit(1);
  const since = lastChar?.at ?? null;

  const reacted = await db
    .select({ emoji: reactions.emoji, sender: messages.sender, text: messages.text, mediaId: messages.mediaId })
    .from(reactions)
    .innerJoin(messages, eq(messages.id, reactions.msgId))
    .where(and(eq(messages.relId, relId), eq(reactions.by, "user"), ...(since ? [gt(reactions.at, since)] : []), lte(reactions.at, now)))
    .orderBy(asc(reactions.at));

  const replies = await db
    .select({ text: messages.text, replyTo: messages.replyTo })
    .from(messages)
    .where(and(eq(messages.relId, relId), eq(messages.sender, "user"), isNotNull(messages.replyTo), ...(since ? [gt(messages.at, since)] : []), lte(messages.at, upTo)))
    .orderBy(asc(messages.at), asc(messages.id));
  const quotedIds = replies.map((r) => r.replyTo as string);
  const quoted = quotedIds.length
    ? await db
        .select({ id: messages.id, sender: messages.sender, text: messages.text, mediaId: messages.mediaId })
        .from(messages)
        .where(and(visible(relId, now), inArray(messages.id, quotedIds)))
    : [];
  const byId = new Map(quoted.map((q) => [q.id, q]));

  const mediaIds = [...reacted, ...quoted].map((r) => r.mediaId).filter((x): x is string => !!x);
  const photos = await photoDescriptions(db, [...new Set(mediaIds)]);

  const lines: string[] = [];
  for (const r of reacted) lines.push(r.mediaId ? `she reacted ${r.emoji} to: ${target(r, photos)}` : `she reacted ${r.emoji} to: "${clip(r.text)}"`);
  for (const r of replies) {
    const q = byId.get(r.replyTo as string);
    if (q) lines.push(`she replied to ${target(q, photos)} with: "${clip(r.text)}"`);
  }
  return lines;
}

/** persona.system 뒤에 붙일 문맥 블록. 줄이 없으면 빈 문자열. */
export function replyContextBlock(lines: string[]): string {
  if (lines.length === 0) return "";
  return ["", "Since your last reply (taps and quoted replies in the chat; respond to them naturally only if it fits):", ...lines.map((l) => `- ${l}`)].join("\n");
}

// ---------- 그의 반응(W11) ----------

/** 1/3 추첨 → 두 번 연속 금지 뒤 전체 약 25%. 메시지 id로 고정(seed). */
const GATE = 3;
const BUSY_DELAY_MS = 10 * 60000;

export function rollsCharReaction(userMsgId: string): boolean {
  return hash32(`${userMsgId}:react`) % GATE === 0;
}

/** 순수 판정: 후보·추첨·연속 금지·같은 이모지 3연속 금지. */
export function decideCharReaction(i: { userMsgId: string; candidate: string | null; prevHasReaction: boolean; lastTwo: string[] }): string | null {
  if (!i.candidate || !isCharReaction(i.candidate)) return null;
  if (i.prevHasReaction || !rollsCharReaction(i.userMsgId)) return null;
  if (i.lastTwo.length >= 2 && i.lastTwo.every((e) => e === i.candidate)) return null;
  return i.candidate;
}

/**
 * 답장이 예약될 때 사용자 메시지에 그의 반응을 가끔 단다(at = 그 메시지의 seen_at).
 * 바쁘고 답장이 10분 넘게 늦으면 👀, 아니면 judged(판단 호출의 reaction 필드 또는 규칙). 기록한 emoji 또는 null.
 */
export async function maybeRecordCharReaction(
  db: Db,
  i: { userId: string; relId: string; userMsgId: string; judged: string | null; busy: number; delayMs: number },
): Promise<string | null> {
  const [u] = await db.select({ at: messages.at, seenAt: messages.seenAt }).from(messages).where(eq(messages.id, i.userMsgId)).limit(1);
  if (!u?.seenAt) return null;
  const candidate = i.busy > 0 && i.delayMs > BUSY_DELAY_MS ? BUSY_REACTION : i.judged;
  const [prev] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.relId, i.relId), eq(messages.sender, "user"), lt(messages.at, u.at)))
    .orderBy(desc(messages.at), desc(messages.id))
    .limit(1);
  const prevHasReaction = prev
    ? (await db.select({ e: reactions.emoji }).from(reactions).where(and(eq(reactions.msgId, prev.id), eq(reactions.by, "char"))).limit(1)).length > 0
    : false;
  const lastTwo = (
    await db
      .select({ e: reactions.emoji })
      .from(reactions)
      .innerJoin(messages, eq(messages.id, reactions.msgId))
      .where(and(eq(messages.relId, i.relId), eq(reactions.by, "char")))
      .orderBy(desc(reactions.at))
      .limit(2)
  ).map((r) => r.e);
  const emoji = decideCharReaction({ userMsgId: i.userMsgId, candidate, prevHasReaction, lastTwo });
  if (!emoji) return null;
  const [row] = await db
    .insert(reactions)
    .values({ msgId: i.userMsgId, userId: i.userId, by: "char", emoji, at: u.seenAt })
    .onConflictDoNothing()
    .returning({ e: reactions.emoji });
  return row?.e ?? null;
}

/** seen_at이 다시 계산되면(F7 재생성) 아직 안 보인 그의 반응도 같은 시각으로 옮긴다. */
export async function moveCharReaction(db: Db, msgId: string, at: Date, now: Date): Promise<void> {
  await db
    .update(reactions)
    .set({ at })
    .where(and(eq(reactions.msgId, msgId), eq(reactions.by, "char"), gt(reactions.at, now)));
}
