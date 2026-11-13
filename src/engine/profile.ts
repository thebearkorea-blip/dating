// 2층 프로필 굳히기. 첫 14일(또는 사용자 메시지 60건) 동안 profile_suggestions를 누적하고, 기한이 되면 relationships.profile로
// 확정(frozen_at)한 뒤 불변. 프로필은 말하는 방식의 경향일 뿐 1층(그의 가치·거절 기준)을 바꾸지 않는다.
import { and, count, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { messages, relationships } from "../db/schema/index";
import { judgeJson, judgeModeOf, type JudgeLlm, type JudgeMode } from "./judge.js";

export const FREEZE_DAYS = 14;
export const FREEZE_MESSAGES = 60;
const DAY_MS = 86400000;

export interface ProfileScores {
  playfulness: number;
  initiative: number;
  directness: number;
  weakness_shown: number;
}
export interface ProfileSuggestions extends ProfileScores {
  /** 지금까지 점수에 반영한 사용자 메시지 수 */
  n: number;
}
const KEYS = ["playfulness", "initiative", "directness", "weakness_shown"] as const;

const RULES: Record<(typeof KEYS)[number], RegExp> = {
  playfulness: /haha|lol|lmao|😂|😜|;\)|\bjk\b|tease|kidding/i,
  initiative: /\?|let'?s|want to|wanna|how about|shall we/i,
  directness: /miss you|love you|like you|care about you|thinking (?:of|about) you/i,
  weakness_shown: /tired|sad|scared|anxious|worried|lonely|stressed|afraid|struggl|exhausted/i,
};

/** 규칙 점수: 각 항목에 해당하는 메시지 비율(0~1). */
export function scoreByRules(texts: string[]): ProfileScores {
  const out = { playfulness: 0, initiative: 0, directness: 0, weakness_shown: 0 };
  if (texts.length === 0) return out;
  for (const k of KEYS) out[k] = texts.filter((t) => RULES[k].test(t)).length / texts.length;
  return out;
}

async function scoreByLlm(texts: string[], llm?: JudgeLlm): Promise<ProfileScores | null> {
  const r = await judgeJson(
    llm,
    "Rate the user's messages from 0 to 1 on: playfulness (teasing, jokes), initiative (proposes things, asks questions), directness (says affection plainly), weakness_shown (shares struggles). Answer {\"playfulness\":0.0,\"initiative\":0.0,\"directness\":0.0,\"weakness_shown\":0.0}.",
    texts.join("\n"),
  );
  if (!r) return null;
  const out = { playfulness: 0, initiative: 0, directness: 0, weakness_shown: 0 };
  for (const k of KEYS) {
    const v = r[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    out[k] = Math.min(1, Math.max(0, v));
  }
  return out;
}

/** 이전 누적(n개 메시지 평균)과 이번 배치(m개)를 가중 평균한다(순수). */
export function mergeSuggestions(prev: ProfileSuggestions | null, batch: ProfileScores, m: number): ProfileSuggestions {
  const n = prev?.n ?? 0;
  const total = n + m;
  const out = { n: total, playfulness: 0, initiative: 0, directness: 0, weakness_shown: 0 };
  for (const k of KEYS) out[k] = total === 0 ? 0 : ((prev?.[k] ?? 0) * n + batch[k] * m) / total;
  return out;
}

/** 굳힌 뒤에는 아무것도 하지 않는다. */
export async function accumulateSuggestions(db: Db, relId: string, texts: string[], opts: { mode?: JudgeMode; llm?: JudgeLlm } = {}): Promise<void> {
  if (texts.length === 0) return;
  const [r] = await db.select({ frozen: relationships.frozenAt, s: relationships.profileSuggestions }).from(relationships).where(eq(relationships.id, relId)).limit(1);
  if (!r || r.frozen) return;
  const scores = (judgeModeOf(opts.mode) === "llm" ? await scoreByLlm(texts, opts.llm) : null) ?? scoreByRules(texts);
  await db.update(relationships).set({ profileSuggestions: mergeSuggestions((r.s as ProfileSuggestions | null) ?? null, scores, texts.length) }).where(eq(relationships.id, relId));
}

/** 기한(14일) 또는 사용자 메시지 60건에 도달하면 profile 확정. 확정했으면 true. */
export async function maybeFreezeProfile(db: Db, relId: string, now: Date): Promise<boolean> {
  const [r] = await db
    .select({ frozen: relationships.frozenAt, s: relationships.profileSuggestions, started: relationships.startedAt })
    .from(relationships)
    .where(eq(relationships.id, relId))
    .limit(1);
  if (!r || r.frozen) return false;
  const [c] = await db.select({ n: count() }).from(messages).where(and(eq(messages.relId, relId), eq(messages.sender, "user")));
  const due = now.getTime() - r.started.getTime() >= FREEZE_DAYS * DAY_MS || (c?.n ?? 0) >= FREEZE_MESSAGES;
  if (!due) return false;
  const s = (r.s as ProfileSuggestions | null) ?? { n: 0, playfulness: 0.5, initiative: 0.5, directness: 0.5, weakness_shown: 0.5 };
  const { n: _n, ...profile } = s;
  await db.update(relationships).set({ profile, frozenAt: now }).where(eq(relationships.id, relId));
  return true;
}

const level = (v: number): string => (v >= 0.66 ? "high" : v <= 0.33 ? "low" : "medium");

/** persona suffix용 문장. 수치 없이 경향만, 1층 가치·거절 기준을 건드리지 않는다는 문구 포함. */
export function profileText(profile: unknown): string | undefined {
  if (!profile || typeof profile !== "object") return undefined;
  const p = profile as Partial<ProfileScores>;
  if (!KEYS.every((k) => typeof p[k] === "number")) return undefined;
  return [
    `- Playful banter from them: ${level(p.playfulness as number)}`,
    `- They take initiative in conversation: ${level(p.initiative as number)}`,
    `- They express affection directly: ${level(p.directness as number)}`,
    `- They show their struggles openly: ${level(p.weakness_shown as number)}`,
    "These are only tendencies in how they talk. They never change your own values or what you refuse.",
  ].join("\n");
}
