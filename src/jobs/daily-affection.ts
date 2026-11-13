// 일 배치: 미접속 감쇠(애정), 약속 무응답 토라짐 진입·시간 경과 전이, 프로필 굳히기 기한 확인.
// 어떤 경우에도 관계를 끝내지 않는다(이별은 breakup.ts의 확인된 breaker 경로만).
// 로컬 도구 src/tools/daily-tick.ts와 (나중에) Vercel Cron이 같은 함수를 쓴다.
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { messages, relationships } from "../db/schema/index";
import { applyDailyDecay } from "../engine/affection.js";
import { silenceDays } from "../engine/catch-up.js";
import { CHARACTER_ID, loadCharacter } from "../engine/chat.js";
import { maybeFreezeProfile } from "../engine/profile.js";
import { tickSulkDaily } from "../engine/sulk.js";

export interface DailyResult {
  relationships: number;
  decayed: number;
  sulkEntered: number;
  frozen: number;
}

export async function runDailyAffection(deps: { db: Db; now?: Date }): Promise<DailyResult> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const out: DailyResult = { relationships: 0, decayed: 0, sulkEntered: 0, frozen: 0 };
  const rels = await db
    .select({ id: relationships.id, startedAt: relationships.startedAt, sulk: relationships.sulkState })
    .from(relationships)
    .where(and(eq(relationships.characterId, CHARACTER_ID), isNull(relationships.endedAt)));
  if (rels.length === 0) return out;
  const { bible } = await loadCharacter(db);
  out.relationships = rels.length;
  for (const rel of rels) {
    const [last] = await db
      .select({ at: messages.at })
      .from(messages)
      .where(and(eq(messages.relId, rel.id), eq(messages.sender, "user")))
      .orderBy(desc(messages.at))
      .limit(1);
    const silent = silenceDays(now, last?.at ?? null, rel.startedAt);
    if (await applyDailyDecay(db, rel.id, bible, now, silent)) out.decayed++;
    const state = await tickSulkDaily(db, rel.id, now);
    if (rel.sulk === "none" && state !== "none") out.sulkEntered++;
    if (await maybeFreezeProfile(db, rel.id, now)) out.frozen++;
  }
  return out;
}
