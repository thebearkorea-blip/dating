// 토라짐 상태기계: none → mild → sulking → thawing → none. 행동으로만 드러낸다(사용자를 탓하는 말은 guards C3).
// 진입: 3일+ 무응답 뒤 복귀 / 그가 제안한 약속에 24시간 무응답. 해소: 사과·기억 꺼내기(판단용 분류) 또는 48시간.
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { relationships } from "../db/schema/index";
import { judgeJson, judgeModeOf, type JudgeLlm, type JudgeMode } from "./judge.js";

export type SulkState = "none" | "mild" | "sulking" | "thawing";

const HOUR = 3600000;
export const RETURN_AFTER_DAYS = 3;
export const PROMISE_WAIT_MS = 24 * HOUR;
export const ESCALATE_MS = 24 * HOUR;
export const NATURAL_MS = 48 * HOUR;
export const THAW_MS = 12 * HOUR;

/** 토라진 동안 피하는 화제(persona suffix로만 전달). */
export const AVOID_TOPICS = ["his schedule and practice details", "future plans together", "pet names and affectionate teasing"] as const;

export const isSulking = (s: string): boolean => s === "mild" || s === "sulking";

/** 시간 경과에 따른 전이(순수). mild→sulking(24h), mild/sulking→thawing(48h 자연 해소), thawing→none(12h). */
export function advanceSulk(state: SulkState, since: Date | null, now: Date): { state: SulkState; since: Date | null } {
  if (state === "none" || !since) return { state: "none", since: null };
  const age = now.getTime() - since.getTime();
  if (state === "thawing") return age >= THAW_MS ? { state: "none", since: null } : { state, since };
  if (age >= NATURAL_MS) return { state: "thawing", since: now };
  if (state === "mild" && age >= ESCALATE_MS) return { state: "sulking", since };
  return { state, since };
}

/** 진입 판정(순수). 이미 토라짐 중이면 null. */
export function sulkEntry(i: { state: SulkState; now: Date; silentDays: number | null; promiseAt: Date | null }, returning: boolean): "return" | "promise" | null {
  if (i.state !== "none") return null;
  if (returning && i.silentDays !== null && i.silentDays >= RETURN_AFTER_DAYS) return "return";
  if (i.promiseAt && i.now.getTime() - i.promiseAt.getTime() >= PROMISE_WAIT_MS) return "promise";
  return null;
}

/** 해소 판정: 진심 어린 사과 또는 그가 전에 한 말을 기억해 꺼냄. mock이면 키워드 sorry|remember. */
export async function resolvesSulk(text: string, opts: { mode?: JudgeMode; llm?: JudgeLlm } = {}): Promise<boolean> {
  if (judgeModeOf(opts.mode) === "rules") return /sorry|remember/i.test(text);
  const r = await judgeJson(
    opts.llm,
    'Decide whether the user message is a sincere apology, or recalls something the character told them earlier (showing they remembered). Answer {"resolved":true|false}.',
    text,
  );
  return r?.resolved === true;
}

interface SulkRow {
  state: string;
  since: Date | null;
}

async function load(db: Db, relId: string): Promise<SulkRow> {
  const [r] = await db.select({ state: relationships.sulkState, since: relationships.sulkSince }).from(relationships).where(eq(relationships.id, relId)).limit(1);
  if (!r) throw new Error("관계 없음");
  return r;
}

async function save(db: Db, relId: string, state: SulkState, since: Date | null, extra: { promiseAt?: null } = {}): Promise<void> {
  await db.update(relationships).set({ sulkState: state, sulkSince: since, ...extra }).where(eq(relationships.id, relId));
}

/** 시간 경과만 반영(일 배치·메시지 처리 공통). 현재 상태를 돌려준다. */
export async function tickSulk(db: Db, relId: string, now: Date): Promise<SulkState> {
  const r = await load(db, relId);
  const next = advanceSulk(r.state as SulkState, r.since, now);
  if (next.state !== r.state) await save(db, relId, next.state, next.since);
  return next.state;
}

/** 일 배치: 약속에 24시간 무응답이면 토라짐 진입. 시간 경과도 함께 반영. */
export async function tickSulkDaily(db: Db, relId: string, now: Date): Promise<SulkState> {
  const state = await tickSulk(db, relId, now);
  const [r] = await db.select({ p: relationships.promiseAt }).from(relationships).where(eq(relationships.id, relId)).limit(1);
  if (sulkEntry({ state, now, silentDays: null, promiseAt: r?.p ?? null }, false) === "promise") {
    await save(db, relId, "mild", now, { promiseAt: null });
    return "mild";
  }
  return state;
}

/** 사용자 메시지 1건 처리: 시간 경과 → (3일+ 공백 뒤 복귀면) 진입 → 해소 판정. 처리 뒤 상태를 돌려준다. */
export async function onUserMessageSulk(
  db: Db,
  relId: string,
  now: Date,
  ctx: { text: string; silentDays: number | null; mode?: JudgeMode; llm?: JudgeLlm },
): Promise<SulkState> {
  let state = await tickSulk(db, relId, now);
  if (sulkEntry({ state, now, silentDays: ctx.silentDays, promiseAt: null }, true) === "return") {
    state = "mild";
    await save(db, relId, "mild", now);
  }
  if (isSulking(state) && (await resolvesSulk(ctx.text, { mode: ctx.mode, llm: ctx.llm }))) {
    state = "thawing";
    await save(db, relId, "thawing", now);
  }
  return state;
}

/** persona suffix용 지시(영어, 값은 싣지 않는다). thawing·none이면 null. */
export function sulkDirective(state: string): string | null {
  if (!isSulking(state)) return null;
  return [
    "You are a little hurt and quiet right now. Show it only through behavior, never through words about their absence or fault.",
    "Reply with at most one short sentence. Do not volunteer new topics. Do not reach out first.",
    `Avoid these topics for now: ${AVOID_TOPICS.join("; ")}.`,
    "Never blame, scold, or guilt-trip them. If they apologize or bring up something you once told them, soften.",
  ].join("\n");
}
