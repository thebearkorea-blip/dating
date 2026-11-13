// 이별 전이. 관계를 끝내는(ended_at을 쓰는) 코드는 이 파일의 endRelationship 하나뿐이다.
// 결제·방치(미접속)·한도로는 이 경로에 닿지 않는다(tests/engine/affection-sulk-breakup.test.ts가 소스를 grep으로 확인).
// 흐름: 분류 → pending_breaker 저장 + 확인 질문 1회 → 다음 사용자 메시지가 긍정이면 이별 장면 + ended_at / 아니면 해제.
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { messages, relationships } from "../db/schema/index";
import type { JudgeLlm, JudgeMode } from "./judge.js";
import { classifyBreaker, confirmsBreaker } from "../policy/breakers.js";
import { scenesByTrigger } from "./scenes.js";

const BUBBLE_GAP_MS = 1000;

/** 캐릭터 메시지의 at/deliver_at. 사용자 메시지 at보다 최소 1초 뒤(표시 순서 역전 방지)라 모든 캐릭터 메시지 저장이 이 함수를 거친다. */
export function nextCharacterAt(userAt: Date, delayMs: number): Date {
  return new Date(userAt.getTime() + Math.max(delayMs, 1000));
}

/** 장면 말풍선을 사용자 메시지 at 다음 1초부터 1초 간격으로 저장한다. */
export async function sendBubbles(db: Db, relId: string, bubbles: string[], userAt: Date, tags: { origin?: string } = {}): Promise<void> {
  for (const [i, text] of bubbles.entries()) {
    const when = nextCharacterAt(userAt, 1000 + i * BUBBLE_GAP_MS);
    await db.insert(messages).values({ relId, at: when, deliverAt: when, sender: "char", text, origin: tags.origin ?? "reply" });
  }
}

/** 관계 종료의 유일한 쓰기 지점. */
async function endRelationship(db: Db, relId: string, now: Date): Promise<void> {
  await db.update(relationships).set({ endedAt: now, pendingBreaker: null }).where(eq(relationships.id, relId));
}

export type BreakerTurn = "none" | "asked" | "ended" | "released";

/** 사용자 메시지 1건에 대한 이별 전이. "none"이면 일반 답장을 계속한다. */
export async function breakerTurn(
  db: Db,
  characterId: string,
  rel: { id: string; pendingBreaker: string | null },
  text: string,
  now: Date,
  opts: { mode?: JudgeMode; llm?: JudgeLlm } = {},
): Promise<BreakerTurn> {
  const scene = scenesByTrigger(characterId, "breaker_confirmed")[0];
  if (!scene) return "none";
  if (rel.pendingBreaker) {
    if (await confirmsBreaker(text, opts)) {
      await sendBubbles(db, rel.id, scene.bubbles, now);
      await endRelationship(db, rel.id, now);
      return "ended";
    }
    await db.update(relationships).set({ pendingBreaker: null }).where(eq(relationships.id, rel.id));
    return "released";
  }
  const id = await classifyBreaker(text, opts);
  if (!id || !scene.confirmLine) return "none";
  await db.update(relationships).set({ pendingBreaker: id }).where(eq(relationships.id, rel.id));
  await sendBubbles(db, rel.id, [scene.confirmLine], now);
  return "asked";
}
