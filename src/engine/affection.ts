// 숨김 애정도(0~100). 어떤 DTO·HTML에도 싣지 않는다(src/app 에는 이 모듈을 import하지 않는다).
// 규칙: 사용자 메시지 +1, 그의 질문에 답하면 +2(둘 합쳐 일 상한 +5), 미접속 감쇠 -2/일(4일째부터 -1).
// 단계 경계: bible에 thresholds가 없어 0~100을 단계 수로 균등 분할한다.
import { and, eq } from "drizzle-orm";
import type { Bible } from "../content/schemas/index.js";
import type { Db } from "../db/client";
import { disclosures, relationships } from "../db/schema/index";
import { kstParts } from "./schedule.js";

export const MESSAGE_GAIN = 1;
export const ANSWER_GAIN = 2;
export const DAILY_CAP = 5;
const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** 균등 분할: 단계 수 5 → 0~19=1, 20~39=2, 40~59=3, 60~79=4, 80~100=5. */
export function stageOf(value: number, stageCount: number): number {
  return Math.min(stageCount, Math.floor(clamp(value) / (100 / stageCount)) + 1);
}

/** 사용자 메시지 1건의 증가분(일 상한 적용). 이미 오른 양 `todayGain`을 받는다. */
export function messageGain(todayGain: number, answered: boolean): number {
  return Math.max(0, Math.min(answered ? MESSAGE_GAIN + ANSWER_GAIN : MESSAGE_GAIN, DAILY_CAP - todayGain));
}

/** 미접속 `silentDays`일째(1부터) 하루치 감쇠량. 1~3일째 2, 4일째부터 1. */
export function decayFor(silentDays: number): number {
  if (silentDays < 1) return 0;
  return silentDays >= 4 ? 1 : 2;
}

export interface AffectionChange {
  affection: number;
  stage: number;
  /** 단계가 올랐을 때만: 새로 해금돼 아직 말하지 않은 비밀 id 1개 */
  unlockedSecret: string | null;
}

async function disclosedIds(db: Db, relId: string): Promise<Set<string>> {
  return new Set((await db.select({ id: disclosures.secretId }).from(disclosures).where(eq(disclosures.relId, relId))).map((r) => r.id));
}

/** 새 값을 저장하고 단계를 다시 계산한다. 단계가 올랐고 대기 중인 비밀이 없으면 해금 비밀 1개를 대기시킨다. */
async function commit(db: Db, relId: string, bible: Bible, next: number, extra: Partial<typeof relationships.$inferInsert> = {}): Promise<AffectionChange> {
  const [r] = await db
    .select({ stage: relationships.stage, pending: relationships.pendingSecret })
    .from(relationships)
    .where(eq(relationships.id, relId))
    .limit(1);
  if (!r) throw new Error("관계 없음");
  const stage = stageOf(next, bible.affection_stages.length);
  let pending = r.pending;
  let unlocked: string | null = null;
  if (stage > r.stage && !pending) {
    const done = await disclosedIds(db, relId);
    const s = bible.secrets.find((x) => x.unlock_stage > r.stage && x.unlock_stage <= stage && !done.has(x.id));
    if (s) {
      pending = s.id;
      unlocked = s.id;
    }
  }
  await db.update(relationships).set({ affection: next, stage, pendingSecret: pending, ...extra }).where(eq(relationships.id, relId));
  return { affection: next, stage, unlockedSecret: unlocked };
}

/** 사용자 메시지 1건 반영. `answered`: 직전 그의 말이 질문이었다. */
export async function applyUserMessage(db: Db, relId: string, bible: Bible, now: Date, answered: boolean): Promise<AffectionChange> {
  const [r] = await db
    .select({ a: relationships.affection, day: relationships.affectionDay, gain: relationships.affectionDayGain })
    .from(relationships)
    .where(eq(relationships.id, relId))
    .limit(1);
  if (!r) throw new Error("관계 없음");
  const today = kstParts(now).date;
  const used = r.day === today ? r.gain : 0;
  const g = messageGain(used, answered);
  return commit(db, relId, bible, clamp(r.a + g), { affectionDay: today, affectionDayGain: used + g });
}

/** 하루 감쇠 1회(같은 KST 날짜에 두 번 깎지 않는다). `silentDays`: 마지막 사용자 접촉 뒤 지난 날수. */
export async function applyDailyDecay(db: Db, relId: string, bible: Bible, now: Date, silentDays: number): Promise<AffectionChange | null> {
  const today = kstParts(now).date;
  const [r] = await db
    .select({ a: relationships.affection, ticked: relationships.affectionTickedOn })
    .from(relationships)
    .where(and(eq(relationships.id, relId)))
    .limit(1);
  if (!r || r.ticked === today) return null;
  return commit(db, relId, bible, clamp(r.a - decayFor(silentDays)), { affectionTickedOn: today });
}
