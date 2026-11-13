// 이별 뒤 재시작: ended_at + 쿨다운(30일) 뒤에만 사과를 받는다. 진정성 평가 → 수락(기억 유지) / 거절(+14일).
import { eq, and } from "drizzle-orm";
import type { Db } from "../db/client";
import { messages, relationships } from "../db/schema/index";
import { judgeJson, judgeModeOf, type JudgeLlm, type JudgeMode } from "./judge.js";
import { sendBubbles } from "./breakup.js";
import { CHARACTER_ID, loadCharacter } from "./chat.js";
import { scenesByTrigger } from "./scenes.js";

const DAY_MS = 86400000;
export const DECLINE_RETRY_DAYS = 14;
const MIN_SINCERE_LENGTH = 40;

export type ReconcileStatus = "active" | "waiting" | "open";

/** 이별 상태 판정. 날짜는 화면에 내지 않는다("아직"만). */
export async function reconcileStatus(db: Db, relId: string, now: Date): Promise<ReconcileStatus> {
  const [r] = await db.select({ ended: relationships.endedAt, after: relationships.reconcileAfter }).from(relationships).where(eq(relationships.id, relId)).limit(1);
  if (!r?.ended) return "active";
  const { bible } = await loadCharacter(db);
  const open = Math.max(r.ended.getTime() + bible.reconcile.cooldown_days * DAY_MS, r.after?.getTime() ?? 0);
  return now.getTime() >= open ? "open" : "waiting";
}

/** 진정성 평가. mock(규칙)이면 길이 40자 이상 ∧ "sorry". */
export async function isSincere(text: string, opts: { mode?: JudgeMode; llm?: JudgeLlm } = {}): Promise<boolean> {
  if (judgeModeOf(opts.mode) === "rules") return text.trim().length >= MIN_SINCERE_LENGTH && /sorry/i.test(text);
  const r = await judgeJson(opts.llm, 'Decide whether this is a sincere, specific apology that takes responsibility without excuses or demands. Answer {"sincere":true|false}.', text);
  return r?.sincere === true;
}

export type ReconcileResult = "not_ended" | "too_early" | "empty" | "accepted" | "declined";

export interface ReconcileDeps {
  db: Db;
  now?: Date;
  llm?: JudgeLlm;
  memoryMode?: JudgeMode;
}

export async function handleReconcile(deps: ReconcileDeps, userId: string, rawText: string): Promise<ReconcileResult> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const text = rawText.trim().slice(0, 1000);
  const [rel] = await db
    .select({ id: relationships.id })
    .from(relationships)
    .where(and(eq(relationships.userId, userId), eq(relationships.characterId, CHARACTER_ID)))
    .limit(1);
  if (!rel) throw new Error("관계 없음");
  const status = await reconcileStatus(db, rel.id, now);
  if (status === "active") return "not_ended";
  if (status === "waiting") return "too_early";
  if (!text) return "empty";
  await db.insert(messages).values({ relId: rel.id, at: now, deliverAt: now, sender: "user", text });
  const ok = await isSincere(text, { mode: deps.memoryMode, llm: deps.llm });
  const scene = scenesByTrigger(CHARACTER_ID, ok ? "apology_accepted" : "apology_declined")[0];
  if (scene) await sendBubbles(db, rel.id, scene.bubbles, new Date(now.getTime() + 1000));
  if (ok) {
    await db
      .update(relationships)
      .set({ reconciledAt: now, endedAt: null, reconcileAfter: null, pendingBreaker: null, sulkState: "none", sulkSince: null })
      .where(eq(relationships.id, rel.id));
    return "accepted";
  }
  await db.update(relationships).set({ reconcileAfter: new Date(now.getTime() + DECLINE_RETRY_DAYS * DAY_MS) }).where(eq(relationships.id, rel.id));
  return "declined";
}
