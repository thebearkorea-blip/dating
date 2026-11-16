// 채팅 화면의 유일한 읽기 경로. `deliver_at <= now` 필터와 DTO 변환을 여기서만 한다.
// 화면·API·검색·/him은 이 함수로만 메시지를 읽는다. origin·tag·seen_at(미래)은 싣지 않는다.
import { and, asc, desc, eq, gt, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client";
import { messages, reactions, relationships } from "../db/schema/index";
import { getCharacterId } from "../product/index.js";
import { activityLine, currentActivity, nextDeliverAt } from "./chat.js";
import { ruleUrgent } from "./judge.js";
import { typingStartDelayMs, typingWindowMs } from "./typing.js";

export { seenAtFor, typingStartDelayMs, typingWindowMs } from "./typing.js";

export type MessageSender = "user" | "char" | "member";

export interface MessageDto {
  id: string;
  sender: MessageSender;
  text: string;
  mediaId: string | null;
  /** ISO. deliver_at과 같다. */
  at: string;
  /** 인용 대상(도착한 것만). text는 200자 절삭. */
  replyTo: { id: string; sender: MessageSender; text: string; mediaId: string | null } | null;
  /** user = 내 반응(그의 메시지에), char = 그의 반응(내 메시지에, at <= now인 것만). */
  reactions: { user?: string; char?: string };
  /** 내 마지막 메시지에만. */
  status?: "read" | "delivered";
  /** status가 read일 때만. ISO. 미래 seen_at은 절대 싣지 않는다. */
  readAt?: string;
}

/** 내 마지막 도착 메시지의 상태. 목록 조회(after 등)에 그 메시지가 없어도 화면이 Delivered→Read를 갱신하도록 meta에 싣는다. */
export interface MineStatus {
  id: string;
  status: "read" | "delivered";
  readAt: string | null;
}

/** 이미 화면에 있는 내 말풍선에 나중에 붙는 그의 반응을 after 조회에서도 받기 위한 목록(at <= now). */
export interface CharReaction {
  id: string;
  emoji: string;
}

export interface ChatMeta {
  serverNow: string;
  /** 다음 상태 변화(입력 중 시작 또는 도착) 시각. 내용·길이는 싣지 않는다. */
  wakeAt: string | null;
  typing: boolean;
  activity: string;
  mine: MineStatus | null;
  /** 최근 그의 반응(도착한 것만, 최신 CHAR_REACTION_RECENT개). */
  charReactions: CharReaction[];
}

export type MessageQuery =
  | { mode: "latest"; limit?: number }
  | { mode: "after"; id: string }
  | { mode: "before"; id: string; limit?: number }
  | { mode: "around"; id: string };

export interface MessagePage {
  messages: MessageDto[];
  hasMoreBefore: boolean;
}

export const PAGE_LIMIT = 50;
export const AROUND_SIDE = 25;
const AFTER_MAX = 200;
const CHAR_REACTION_RECENT = 30;
const QUOTE_MAX = 200;
/** 보낸 뒤 이 시간 안에 답장 행이 안 생기면 "생성 중"으로 보지 않는다. */
const AWAIT_REPLY_MS = 2 * 60000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string): boolean => UUID.test(s);

/** 이 사용자의 관계 행. relId를 주면 그 관계가 본인 것일 때만. */
export async function findOwnedRelationship(db: Db, userId: string, relId?: string): Promise<{ id: string; stage: number } | null> {
  if (relId !== undefined && !isUuid(relId)) return null;
  const [rel] = await db
    .select({ id: relationships.id, stage: relationships.stage })
    .from(relationships)
    .where(and(eq(relationships.userId, userId), eq(relationships.characterId, getCharacterId()), ...(relId ? [eq(relationships.id, relId)] : [])))
    .limit(1);
  return rel ?? null;
}

type Row = { id: string; sender: string; text: string; mediaId: string | null; deliverAt: Date; replyTo: string | null };

const COLS = { id: messages.id, sender: messages.sender, text: messages.text, mediaId: messages.mediaId, deliverAt: messages.deliverAt, replyTo: messages.replyTo };

/** 도착한 것만 + 빈 텍스트(사진 없음) 제외. 모든 조회(목록·검색·/him)가 이 조건을 거친다. */
export function visible(relId: string, now: Date): SQL {
  return and(
    eq(messages.relId, relId),
    lte(messages.deliverAt, now),
    or(sql`btrim(${messages.text}) <> ''`, isNotNull(messages.mediaId)),
  ) as SQL;
}

/** 기준 행 뒤/앞. 기준 행의 deliver_at을 DB 안에서 비교해 마이크로초 손실을 피한다. */
function afterAnchor(anchorId: string): SQL {
  return sql`(${messages.deliverAt}, ${messages.id}) > (select m.deliver_at, m.id from personal.messages m where m.id = ${anchorId})`;
}
function beforeAnchor(anchorId: string): SQL {
  return sql`(${messages.deliverAt}, ${messages.id}) < (select m.deliver_at, m.id from personal.messages m where m.id = ${anchorId})`;
}

async function anchorExists(db: Db, relId: string, id: string, now: Date): Promise<boolean> {
  if (!isUuid(id)) return false;
  const [r] = await db.select({ id: messages.id }).from(messages).where(and(visible(relId, now), eq(messages.id, id))).limit(1);
  return !!r;
}

const senderOf = (s: string): MessageSender => (s === "user" || s === "member" ? s : "char");

function toDto(r: Row): MessageDto {
  return {
    id: r.id,
    sender: senderOf(r.sender),
    text: r.text,
    mediaId: r.mediaId,
    at: r.deliverAt.toISOString(),
    replyTo: null,
    reactions: {},
  };
}

/** 인용 대상(도착한 것만)과 반응(그의 반응은 at <= now만)을 붙인다. */
async function attachExtras(db: Db, relId: string, now: Date, rows: Row[], dtos: MessageDto[]): Promise<void> {
  if (dtos.length === 0) return;
  const quoteIds = [...new Set(rows.map((r) => r.replyTo).filter((x): x is string => !!x))];
  if (quoteIds.length) {
    const quoted = await db
      .select({ id: messages.id, sender: messages.sender, text: messages.text, mediaId: messages.mediaId })
      .from(messages)
      .where(and(visible(relId, now), inArray(messages.id, quoteIds)));
    const byId = new Map(quoted.map((q) => [q.id, q]));
    rows.forEach((r, i) => {
      const q = r.replyTo ? byId.get(r.replyTo) : undefined;
      if (q) dtos[i]!.replyTo = { id: q.id, sender: senderOf(q.sender), text: q.text.slice(0, QUOTE_MAX), mediaId: q.mediaId };
    });
  }
  const rx = await db
    .select({ msgId: reactions.msgId, by: reactions.by, emoji: reactions.emoji })
    .from(reactions)
    .where(and(inArray(reactions.msgId, dtos.map((d) => d.id)), or(eq(reactions.by, "user"), lte(reactions.at, now))));
  const byMsg = new Map(dtos.map((d) => [d.id, d]));
  for (const r of rx) {
    const d = byMsg.get(r.msgId);
    if (!d) continue;
    if (r.by === "user") d.reactions.user = r.emoji;
    else if (r.by === "char") d.reactions.char = r.emoji;
  }
}

/** 최근 그의 반응(at <= now). after 조회에 없는 옛 말풍선에도 반응이 붙도록 meta에 싣는다. */
async function recentCharReactions(db: Db, relId: string, now: Date): Promise<CharReaction[]> {
  const rows = await db
    .select({ id: reactions.msgId, emoji: reactions.emoji })
    .from(reactions)
    .innerJoin(messages, eq(messages.id, reactions.msgId))
    .where(and(visible(relId, now), eq(reactions.by, "char"), lte(reactions.at, now)))
    .orderBy(desc(reactions.at))
    .limit(CHAR_REACTION_RECENT);
  return rows;
}

/** 내 마지막 메시지(도착한 것 중)의 상태. seen_at이 미래면 Delivered(값은 싣지 않는다). seen_at 없는 옛 행은 그의 다음 메시지 유무로 파생. */
async function lastMineStatus(db: Db, relId: string, now: Date): Promise<MineStatus | null> {
  const [last] = await db
    .select({ id: messages.id, seenAt: messages.seenAt })
    .from(messages)
    .where(and(visible(relId, now), eq(messages.sender, "user")))
    .orderBy(desc(messages.deliverAt), desc(messages.id))
    .limit(1);
  if (!last) return null;
  if (last.seenAt) {
    return last.seenAt.getTime() <= now.getTime() ? { id: last.id, status: "read", readAt: last.seenAt.toISOString() } : { id: last.id, status: "delivered", readAt: null };
  }
  const [later] = await db
    .select({ at: messages.deliverAt })
    .from(messages)
    .where(and(visible(relId, now), sql`${messages.sender} <> 'user'`, afterAnchor(last.id)))
    .orderBy(asc(messages.deliverAt), asc(messages.id))
    .limit(1);
  return later ? { id: last.id, status: "read", readAt: later.at.toISOString() } : { id: last.id, status: "delivered", readAt: null };
}

async function attachStatus(db: Db, relId: string, now: Date, dtos: MessageDto[]): Promise<void> {
  const mine = await lastMineStatus(db, relId, now);
  const dto = mine && dtos.find((d) => d.id === mine.id);
  if (!mine || !dto) return;
  dto.status = mine.status;
  if (mine.readAt) dto.readAt = mine.readAt;
}

/** 메시지 조회의 단일 진입점. 기준 id가 이 관계에 없으면 null(호출부가 404). */
export async function loadMessages(db: Db, relId: string, q: MessageQuery, now: Date): Promise<MessagePage | null> {
  let rows: Row[];
  let hasMoreBefore = false;
  const newestFirst = async (extra: SQL | undefined, limit: number) =>
    (await db.select(COLS).from(messages).where(and(visible(relId, now), extra)).orderBy(desc(messages.deliverAt), desc(messages.id)).limit(limit + 1)) as Row[];

  if (q.mode === "latest" || q.mode === "before") {
    const limit = q.limit ?? PAGE_LIMIT;
    if (q.mode === "before" && !(await anchorExists(db, relId, q.id, now))) return null;
    const got = await newestFirst(q.mode === "before" ? beforeAnchor(q.id) : undefined, limit);
    hasMoreBefore = got.length > limit;
    rows = got.slice(0, limit).reverse();
  } else if (q.mode === "after") {
    // 모르는 기준(방금 보낸 낙관적 id 등)이면 최신 화면으로 본다.
    if (!(await anchorExists(db, relId, q.id, now))) return loadMessages(db, relId, { mode: "latest" }, now);
    rows = (await db
      .select(COLS)
      .from(messages)
      .where(and(visible(relId, now), afterAnchor(q.id)))
      .orderBy(asc(messages.deliverAt), asc(messages.id))
      .limit(AFTER_MAX)) as Row[];
  } else {
    if (!(await anchorExists(db, relId, q.id, now))) return null;
    const older = await newestFirst(beforeAnchor(q.id), AROUND_SIDE);
    hasMoreBefore = older.length > AROUND_SIDE;
    const [anchor] = (await db.select(COLS).from(messages).where(eq(messages.id, q.id)).limit(1)) as Row[];
    const newer = (await db
      .select(COLS)
      .from(messages)
      .where(and(visible(relId, now), afterAnchor(q.id)))
      .orderBy(asc(messages.deliverAt), asc(messages.id))
      .limit(AROUND_SIDE)) as Row[];
    rows = [...older.slice(0, AROUND_SIDE).reverse(), anchor!, ...newer];
  }
  const dtos = rows.map(toDto);
  await attachExtras(db, relId, now, rows, dtos);
  await attachStatus(db, relId, now, dtos);
  return { messages: dtos, hasMoreBefore };
}

/**
 * 서버 시각·다음 깨어날 시각·입력 중·활동 문구. 대기 중 답장의 본문·글자수는 반환하지 않는다
 * (wakeAt은 시각 하나뿐이고, 글자수는 입력 중 시작 시각에만 간접 반영된다).
 */
export async function loadChatMeta(db: Db, rel: { id: string; stage: number }, now: Date): Promise<ChatMeta> {
  const meta = await typingMeta(db, rel, now);
  const mine = await lastMineStatus(db, rel.id, now);
  // Delivered→Read 전환 시각도 다음 상태 변화다. 미래 seen_at 값 자체는 싣지 않고 wakeAt으로만 반영한다.
  const [soon] = await db
    .select({ at: messages.seenAt })
    .from(messages)
    .where(and(eq(messages.relId, rel.id), eq(messages.sender, "user"), gt(messages.seenAt, now)))
    .orderBy(asc(messages.seenAt))
    .limit(1);
  const wake = [meta.wakeAt ? Date.parse(meta.wakeAt) : null, soon?.at ? soon.at.getTime() : null].filter((n): n is number => n !== null);
  return { ...meta, mine, charReactions: await recentCharReactions(db, rel.id, now), wakeAt: wake.length ? new Date(Math.min(...wake)).toISOString() : null };
}

async function typingMeta(db: Db, rel: { id: string; stage: number }, now: Date): Promise<Omit<ChatMeta, "mine" | "charReactions">> {
  const activity = await currentActivity(db, rel.stage, now);
  const base = { serverNow: now.toISOString(), activity: activityLine(activity) };
  const nowMs = now.getTime();

  // 도착 전 가장 이른 행. 길이는 입력 중 시작 시각 계산에만 쓰고 밖으로 내보내지 않는다.
  const [pending] = await db
    .select({ at: messages.deliverAt, len: sql<number>`length(${messages.text})` })
    .from(messages)
    .where(and(eq(messages.relId, rel.id), gt(messages.deliverAt, now), eq(messages.sender, "char")))
    .orderBy(asc(messages.deliverAt), asc(messages.id))
    .limit(1);
  if (pending) {
    const typingAt = pending.at.getTime() - typingWindowMs(Number(pending.len));
    if (nowMs >= typingAt) return { ...base, typing: true, wakeAt: pending.at.toISOString() };
    return { ...base, typing: false, wakeAt: new Date(typingAt).toISOString() };
  }
  // 사용자 메시지가 아닌 미래 행(예: member)이 있으면 도착 시각만.
  const next = await nextDeliverAt(db, rel.id, now);
  if (next) return { ...base, typing: false, wakeAt: next.toISOString() };

  // 답장 행이 아직 없다: 마지막 도착 메시지가 내 것이고 최근이며 그가 바쁘지 않으면(또는 급한 감정 키워드면, M4) 곧 입력 중.
  const [last] = await db
    .select({ id: messages.id, sender: messages.sender, at: messages.deliverAt, text: messages.text })
    .from(messages)
    .where(eq(messages.relId, rel.id))
    .orderBy(desc(messages.deliverAt), desc(messages.id))
    .limit(1);
  if (last && last.sender === "user" && nowMs - last.at.getTime() < AWAIT_REPLY_MS && (activity.busy === 0 || ruleUrgent(last.text))) {
    const typingAt = last.at.getTime() + typingStartDelayMs(last.id);
    if (nowMs >= typingAt) return { ...base, typing: true, wakeAt: null };
    return { ...base, typing: false, wakeAt: new Date(typingAt).toISOString() };
  }
  return { ...base, typing: false, wakeAt: null };
}
