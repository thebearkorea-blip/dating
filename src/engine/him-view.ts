// /him 읽기 경로: 그가 이 관계에 보낸 사진. chat-view의 visible() 조건을 쓴다(도착 전 사진은 안 나온다).
import { and, desc, isNotNull, ne } from "drizzle-orm";
import type { Db } from "../db/client";
import { messages } from "../db/schema/index";
import { activityLine, currentActivity } from "./chat.js";
import { visible } from "./chat-view.js";

export interface SentPhoto {
  messageId: string;
  mediaId: string;
  /** ISO. deliver_at. */
  at: string;
}

export const HIM_PHOTO_LIMIT = 60;

/** 이 관계에서 그(user가 아닌 쪽)가 보낸, 이미 도착한 사진. 최신순. relId 소유 확인은 호출부(findOwnedRelationship). */
export async function loadSentPhotos(db: Db, relId: string, now: Date, limit = HIM_PHOTO_LIMIT): Promise<SentPhoto[]> {
  const rows = await db
    .select({ id: messages.id, mediaId: messages.mediaId, deliverAt: messages.deliverAt })
    .from(messages)
    .where(and(visible(relId, now), ne(messages.sender, "user"), isNotNull(messages.mediaId)))
    .orderBy(desc(messages.deliverAt), desc(messages.id))
    .limit(limit);
  return rows.map((r) => ({ messageId: r.id, mediaId: r.mediaId as string, at: r.deliverAt.toISOString() }));
}

/** /him 오늘 일정 한 줄(채팅 헤더 활동 문구와 같은 원본). 관계 값은 밖으로 내보내지 않는다. */
export async function himActivity(db: Db, rel: { id: string; stage: number }, now: Date): Promise<string> {
  return activityLine(await currentActivity(db, rel.stage, now));
}
