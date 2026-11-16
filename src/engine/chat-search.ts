// 대화 검색. 본인 관계의 도착한 메시지(deliver_at <= now)만, 부분 문자열(ILIKE) 일치.
import { and, desc, ilike, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { messages } from "../db/schema/index";
import { visible } from "./chat-view.js";

export interface SearchHit {
  id: string;
  sender: "user" | "char";
  snippet: string;
  /** ISO. deliver_at과 같다. */
  at: string;
}

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_LIMIT = 50;
const SNIPPET_SIDE = 40;

/** LIKE 와일드카드(% _)와 이스케이프 문자(\)를 글자 그대로 일치시킨다. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function snippetOf(text: string, q: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const i = flat.toLowerCase().indexOf(q.toLowerCase());
  const start = i < 0 ? 0 : Math.max(0, i - SNIPPET_SIDE);
  const end = Math.min(flat.length, (i < 0 ? 0 : i) + q.length + SNIPPET_SIDE);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/** q는 trim 후 SEARCH_MIN_CHARS 미만이면 빈 배열. 최신순, 최대 SEARCH_LIMIT. */
export async function searchMessages(db: Db, relId: string, q: string, now: Date): Promise<SearchHit[]> {
  const term = q.trim();
  if (Array.from(term).length < SEARCH_MIN_CHARS) return [];
  const rows = await db
    .select({ id: messages.id, sender: messages.sender, text: messages.text, deliverAt: messages.deliverAt })
    .from(messages)
    .where(and(visible(relId, now), inArray(messages.sender, ["user", "char"]), ilike(messages.text, `%${escapeLike(term)}%`)))
    .orderBy(desc(messages.deliverAt), desc(messages.id))
    .limit(SEARCH_LIMIT);
  return rows.map((r) => ({ id: r.id, sender: r.sender === "user" ? "user" : "char", snippet: snippetOf(r.text, term), at: r.deliverAt.toISOString() }));
}
