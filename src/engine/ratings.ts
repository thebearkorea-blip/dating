// 베타 테스터의 캐릭터 대사 평가. 베타가 아니면 저장하지 않는다.
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { messages, ratings, relationships } from "../db/schema/index";

const MAX_NOTE = 500;

export type RateResult = "ok" | "not_beta" | "invalid";

/** 본인 관계의 캐릭터 메시지에만 매긴다. 같은 메시지를 다시 매기면 덮어쓴다. */
export async function rateMessageCore(
  db: Db,
  user: { id: string; isBeta: boolean },
  msgId: string,
  score: number,
  note: string,
  now: Date = new Date(),
): Promise<RateResult> {
  if (!user.isBeta) return "not_beta";
  if (score !== 1 && score !== -1) return "invalid";
  const [m] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(relationships, eq(relationships.id, messages.relId))
    .where(and(eq(messages.id, msgId), eq(messages.sender, "char"), eq(relationships.userId, user.id)))
    .limit(1);
  if (!m) return "invalid";
  const n = note.trim().slice(0, MAX_NOTE) || null;
  await db
    .insert(ratings)
    .values({ msgId, userId: user.id, score, note: n, at: now })
    .onConflictDoUpdate({ target: [ratings.msgId, ratings.userId], set: { score, note: n, at: now } });
  return "ok";
}
