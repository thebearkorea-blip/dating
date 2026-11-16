// 채팅 한 턴의 핵심 로직. DB·LLM·시각을 주입받아 단위 테스트가 가능하다(Server Action은 얇은 껍데기).
// 숨김 컬럼은 읽지도 싣지도 않는다(선택 컬럼만).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { now as clockNow } from "../clock";
import { join } from "node:path";
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { parse as parseYaml } from "yaml";
import { bibleSchema, groupSchema, scheduleSchema, timelineSchema, type CanonRow, type Group } from "../content/schemas/index.js";
import type { Db } from "../db/client";
import { canonFacts, characters, disclosures, growthState, memories, messages, relationships, reviewFindings, users } from "../db/schema/index";
import { complete, CHAT_MODEL, type LlmMessage, type LlmRequest, type LlmResponse } from "../llm/index.js";
import { trackedLlm } from "../llm/tracked.js";
import { extractMemories, memoryEvery, memoryFirstAfter, SESSION_GAP_MS } from "../jobs/memory-extract.js";
import { detectBreakers } from "../policy/breakers.js";
import { guardInput, isSafetyScript, SAFETY_SCRIPTS, safetyScriptFor } from "../policy/input-guard.js";
import { generateGuardedReply } from "../policy/output-guard.js";
import { loadGuards, type Finding, type GuardRule } from "../policy/rules.js";
import { applyUserMessage } from "./affection.js";
import { recordEvent } from "./events.js";
import { pendingUserDayScene } from "./first-week.js";
import { scenesByTrigger } from "./scenes.js";
import { breakerTurn, nextCharacterAt } from "./breakup.js";
import { characterLines, fallbackPool, forLang, freeLines, langOf, pickBusyOverlay, pickUnavailable } from "./busy-overlay.js";
import { silenceDays } from "./catch-up.js";
import { buildPersona } from "./persona.js";
import { maybeFreezeProfile, profileText } from "./profile.js";
import { consumeQuota, refundQuota } from "./quota.js";
import { activityAt, formatNowKst, hash32, kstParts, upcomingBlocks, type Activity, type EngineCharacter } from "./schedule.js";
import { seenAtFor } from "./typing.js";
import { judgeModeOf, ruleReaction } from "./judge.js";
import { isQuotable, maybeRecordCharReaction, moveCharReaction, replyContextBlock, replyContextLines } from "./reactions.js";
import { peekSecret, recordDisclosure } from "./secrets.js";
import { onUserMessageSulk, sulkDirective } from "./sulk.js";
import { getCharacterId, getLang } from "../product/index.js";

const CONTENT_ROOT = "content";
/** 성장 상태가 아직 없을 때의 상대일(데뷔 전). */
const DEFAULT_REL_DAY = -150;
const HISTORY_LIMIT = 12;
const MAX_TEXT = 1000;

export interface ChatDeps {
  db: Db;
  now?: Date;
  llm?: (req: LlmRequest) => Promise<LlmResponse>;
  /** 기본: content/policy/guards.yaml */
  rules?: GuardRule[];
  /** 기억 추출 방식. 기본: 공급자가 mock이면 rules, 아니면 llm */
  memoryMode?: "rules" | "llm";
}

let guardsCache: GuardRule[] | undefined;
function defaultRules(): GuardRule[] {
  guardsCache ??= loadGuards(join(CONTENT_ROOT, "policy/guards.yaml"));
  return guardsCache;
}

const timelineCache = new Map<string, EngineCharacter["timeline"]>();
/** content/world/timeline-<characterId>.yaml이 있으면 그것, 없으면 timeline.yaml(1회 캐시). */
function timeline(characterId: string): EngineCharacter["timeline"] {
  let t = timelineCache.get(characterId);
  if (!t) {
    const own = join(CONTENT_ROOT, "world", `timeline-${characterId}.yaml`);
    t = timelineSchema.parse(parseYaml(readFileSync(existsSync(own) ? own : join(CONTENT_ROOT, "world/timeline.yaml"), "utf8")));
    timelineCache.set(characterId, t);
  }
  return t;
}

const groupCache = new Map<string, Group | undefined>();
/** content/world/group*.yaml 중 id가 groupId인 그룹(1회 캐시). 없으면 undefined. */
export function loadGroup(groupId: string): Group | undefined {
  if (!groupCache.has(groupId)) {
    const dir = join(CONTENT_ROOT, "world");
    const found = readdirSync(dir)
      .filter((f) => /^group.*\.yaml$/.test(f))
      .map((f) => groupSchema.parse(parseYaml(readFileSync(join(dir, f), "utf8"))))
      .find((g) => g.id === groupId);
    groupCache.set(groupId, found);
  }
  return groupCache.get(groupId);
}

/** story_start(KST 날짜)부터의 상대일: 시작일 = D-180. 시작 전은 -180으로 고정(준비기 첫날). */
export function relDayFromStoryStart(storyStart: string, now: Date): number {
  const start = Date.parse(`${storyStart}T00:00:00Z`) / 86400000;
  return Math.max(-180, Math.floor(kstParts(now).dayIndex - start) - 180);
}

/** 캐릭터의 오늘 상대일. 상대일 소비처(일정·타임라인 비트·/him D-day·선톡)는 모두 이 함수를 거친다.
 * bible.story_start가 있으면 그 날짜 기준, 없으면 전역 growth_state.currentRelDay. */
export async function relDayFor(db: Db, characterId: string, now: Date = clockNow()): Promise<number> {
  const [c] = await db.select({ bible: characters.bible }).from(characters).where(eq(characters.id, characterId)).limit(1);
  const storyStart = c ? bibleSchema.parse(c.bible).story_start : undefined;
  if (storyStart) return relDayFromStoryStart(storyStart, now);
  const [g] = await db.select({ d: growthState.currentRelDay }).from(growthState).where(eq(growthState.id, 1)).limit(1);
  return g?.d ?? DEFAULT_REL_DAY;
}

/** 현재 제품 캐릭터의 상대일(현재 시각). */
export function relDayOf(db: Db, now?: Date): Promise<number> {
  return relDayFor(db, getCharacterId(), now);
}

export async function loadCharacter(db: Db) {
  const [c] = await db.select().from(characters).where(eq(characters.id, getCharacterId())).limit(1);
  if (!c) throw new Error("캐릭터 데이터 없음: load-content를 먼저 실행하세요");
  const bible = bibleSchema.parse(c.bible);
  const engine: EngineCharacter = {
    id: c.id,
    schedule: scheduleSchema.parse(c.schedule),
    timeline: timeline(c.id),
    affectionStages: bible.affection_stages,
  };
  return { bible, voiceMd: c.voiceMd, engine, group: loadGroup(bible.group_id) };
}

/** 지금 그의 활동(바쁨·답장 지연 범위). */
export async function currentActivity(db: Db, stage: number, now: Date): Promise<Activity> {
  const { engine } = await loadCharacter(db);
  return activityAt(engine, now, { relDay: await relDayOf(db, now), stage });
}

/** relDay가 속한 단계의 문구, 없으면 평문(busy3~free). */
export function phaseActivityLines<T extends { phases?: { from_rel_day: number; to_rel_day: number }[] }>(base: T, relDay?: number) {
  const hit = relDay === undefined ? undefined : base.phases?.find((p) => relDay >= p.from_rel_day && relDay <= p.to_rel_day);
  return (hit ?? base) as Omit<T, "phases">;
}

/** 화면 상단 한 줄. 숫자·내부 값 없이 응답 가능 시간감만. 문장은 캐릭터 lines.yaml activity(제품 화면 언어). */
export function activityLine(a: Activity): string {
  const l = phaseActivityLines(forLang(characterLines().activity, getLang()), a.relDay);
  if (a.busy >= 3) return l.busy3;
  if (a.busy === 2) return l.busy2;
  if (a.busy === 1) return l.busy1;
  return l.free;
}

const WORD = /[\p{L}\p{N}]+/gu;
const STOP = new Set(["the", "and", "you", "for", "that", "with", "have", "are", "was", "not", "but", "this", "what", "just", "like", "from", "your", "about", "they", "can", "his", "her", "its", "had", "has", "did", "does", "will", "would", "there", "been", "were", "into", "then", "than", "them"]);
/** 띄어쓰기 없는 문자(한자·가나). 이런 토큰은 단어 대신 문자 2-gram으로 비교한다. */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** 2-gram에 한자·가타카나가 하나는 있어야 센다(「ている」 같은 히라가나 문법 조각 제외). */
const CJK_KEY = /[\p{Script=Han}\p{Script=Katakana}]/u;
function words(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().match(WORD) ?? []) {
    if (!CJK.test(w)) {
      if (w.length >= 3 && !STOP.has(w)) out.add(w);
      continue;
    }
    const chars = [...w];
    for (let i = 0; i + 1 < chars.length; i++) {
      const g = `${chars[i]}${chars[i + 1]}`;
      if (CJK_KEY.test(g)) out.add(g);
    }
  }
  return out;
}

/** 최근 10건 + 사용자 메시지와 단어(일본어 등은 문자 2-gram) 2개 이상 겹치는 기억. 삭제된 기억은 제외. */
export async function selectMemories(db: Db, relId: string, userText: string): Promise<string[]> {
  const rows = await db
    .select({ fact: memories.fact })
    .from(memories)
    .where(and(eq(memories.relId, relId), isNull(memories.deletedAt)))
    .orderBy(desc(memories.learnedAt), desc(memories.id));
  const uw = words(userText);
  const picked = new Set(rows.slice(0, 10).map((r) => r.fact));
  for (const r of rows.slice(10)) {
    let n = 0;
    for (const w of words(r.fact)) if (uw.has(w)) n++;
    if (n >= 2) picked.add(r.fact);
  }
  return [...picked];
}

async function logFindings(db: Db, relId: string, messageId: string | null, findings: Finding[]): Promise<void> {
  if (findings.length === 0) return;
  await db
    .insert(reviewFindings)
    .values(findings.map((f) => ({ relId, messageId, ruleId: f.rule_id, severity: f.severity, quote: f.quote, reason: f.reason })));
}

/** 관계의 첫 3개 사용자 메시지는 지연 없이 답한다(2026-11-15 결정, 이전 0~2분). */
const FIRST_REPLY_RANGE = { min: 0, max: 0 };
const FIRST_REPLY_COUNT = 3;

function delayMinutes(a: Activity, seed: string, range = a.replyDelayRange): number {
  const scale = Number(process.env.REPLY_DELAY_SCALE ?? "1");
  const { min, max } = range;
  return (min + (hash32(seed) / 0x100000000) * (max - min)) * (Number.isFinite(scale) ? scale : 1);
}

const EMPTY_REPLY = "empty reply";

/** 빈 텍스트면 1회 재시도하고, 또 비면 던진다(호출부가 unavailable 폴백 처리). */
async function nonEmptyText(call: () => Promise<LlmResponse>): Promise<string> {
  for (let i = 0; i < 2; i++) {
    const t = (await call()).text.trim();
    if (t) return t;
  }
  throw new Error(EMPTY_REPLY);
}

/** 예외에서 상태 코드만 뽑는다. 없으면 일반 사유. */
function llmErrorReason(e: unknown): string {
  const m = e instanceof Error ? /^\w+ (\d{3}):/.exec(e.message) : null;
  if (e instanceof Error && e.message === EMPTY_REPLY) return "llm empty reply";
  return m ? `llm http ${m[1]}` : "llm call failed (network/timeout)";
}

export type SendResult = "ok" | "empty" | "ended" | "duplicate";

export type RecordResult = { status: "ok"; relId: string; userMsgId: string } | { status: "empty" | "ended" | "duplicate"; relId: null; userMsgId: null };

const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 1단계: 사용자 메시지만 저장한다(+first_message). 화면에 바로 보이도록 LLM은 부르지 않는다.
 * clientId(uuid)를 주면 그 id로 저장한다. 이미 있는 id면 아무것도 하지 않고 "duplicate"(재시도 중복·LLM 2회 방지).
 * replyTo(인용 대상)는 같은 관계의 이미 도착한 메시지만. 아니면 던진다.
 */
export async function recordUserMessage(deps: ChatDeps, userId: string, rawText: string, clientId?: string, replyTo?: string | null): Promise<RecordResult> {
  const { db } = deps;
  if (clientId !== undefined && !CLIENT_ID.test(clientId)) throw new Error("잘못된 메시지 id");
  const text = rawText.trim().slice(0, MAX_TEXT);
  if (!text) return { status: "empty", relId: null, userMsgId: null };
  const now = deps.now ?? clockNow();
  const [rel] = await db
    .select({ id: relationships.id, endedAt: relationships.endedAt })
    .from(relationships)
    .where(and(eq(relationships.userId, userId), eq(relationships.characterId, getCharacterId())))
    .limit(1);
  if (!rel) throw new Error("관계 없음: 온보딩 필요");
  // 이별 뒤에는 대화를 받지 않는다(재시작은 reconcile 화면).
  if (rel.endedAt) return { status: "ended", relId: null, userMsgId: null };
  if (replyTo != null && !(await isQuotable(db, rel.id, String(replyTo), now))) throw new Error("잘못된 인용 대상");
  const [userMsg] = await db
    .insert(messages)
    .values({ ...(clientId ? { id: clientId } : {}), relId: rel.id, at: now, deliverAt: now, sender: "user", text, replyTo: replyTo ?? null })
    .onConflictDoNothing({ target: messages.id })
    .returning({ id: messages.id });
  if (!userMsg) {
    if (clientId) return { status: "duplicate", relId: null, userMsgId: null };
    throw new Error("메시지 저장 실패");
  }
  await recordEvent(db, userId, "first_message", { once: "ever", now });
  return { status: "ok", relId: rel.id, userMsgId: userMsg.id };
}

/** 대화 중(그의 답장이 최근 10분 안에 전달됨)은 지연 없음 — 사용자 결정 2026-11-15. */
const LIVE_REPLY_RANGE = { min: 0, max: 0 };
const LIVE_WINDOW_MIN = 10;

/**
 * 아직 전달 전인 일반 답장을 지운다(연속 메시지에 답장이 뒤섞이지 않게). 한도를 쓴 답장 수만큼 환불한다.
 * 안전 대본·이별 확인 질문/장면은 origin이 같아도 지우지 않는다.
 */
async function dropPendingReplies(db: Db, userId: string, relId: string, now: Date): Promise<void> {
  const keep = new Set<string>(Object.values(SAFETY_SCRIPTS));
  for (const s of scenesByTrigger(getCharacterId(), "breaker_confirmed")) {
    if (s.confirmLine) keep.add(s.confirmLine);
    for (const b of s.bubbles) keep.add(b);
  }
  const rows = (
    await db
      .select({ id: messages.id, text: messages.text })
      .from(messages)
      .where(and(eq(messages.relId, relId), eq(messages.sender, "char"), eq(messages.origin, "reply"), gt(messages.deliverAt, now)))
  ).filter((r) => !keep.has(r.text));
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  await db.update(reviewFindings).set({ messageId: null }).where(inArray(reviewFindings.messageId, ids));
  await db.delete(messages).where(inArray(messages.id, ids));
  // 한도를 쓰지 않은 답장: 한도 소진 오버레이, LLM 실패 문장(이미 환불됨).
  const free = freeLines();
  for (const r of rows) if (!free.has(r.text)) await refundQuota(db, userId);
}

/** 2단계: 저장된 사용자 메시지에 대한 그의 답장(전송 지연 포함)과 부수 처리(애정·토라짐·기억)를 한다. */
export async function generateReplyFor(deps: ChatDeps, userId: string, relId: string, userMsgId: string, rawText: string): Promise<void> {
  const { db } = deps;
  const text = rawText.trim().slice(0, MAX_TEXT);
  const now = deps.now ?? clockNow();
  const base = deps.llm ?? complete;
  const rules = deps.rules ?? defaultRules();

  const [rel] = await db
    .select({
      id: relationships.id,
      stage: relationships.stage,
      startedAt: relationships.startedAt,
      endedAt: relationships.endedAt,
      pendingBreaker: relationships.pendingBreaker,
      promiseAt: relationships.promiseAt,
      profile: relationships.profile,
    })
    .from(relationships)
    .where(eq(relationships.id, relId))
    .limit(1);
  if (!rel || rel.endedAt) return;
  const chatLlm = trackedLlm(db, "chat", { relId: rel.id, userId, now }, base);
  const judgeLlm = trackedLlm(db, "judge", { relId: rel.id, userId, now }, base);

  const [userMsg] = await db.select({ id: messages.id, at: messages.at }).from(messages).where(eq(messages.id, userMsgId)).limit(1);
  if (!userMsg) return;
  const [prev] = await db
    .select({ at: messages.at })
    .from(messages)
    .where(and(eq(messages.relId, rel.id), eq(messages.sender, "user"), lt(messages.at, userMsg.at)))
    .orderBy(desc(messages.at))
    .limit(1);

  // 연속 메시지: 아직 전달 전인 이전 답장은 지우고 최신 메시지 기준으로 하나만 만든다.
  await dropPendingReplies(db, userId, rel.id, now);
  /** 생성 도중 더 새 사용자 메시지가 왔으면 그 메시지의 처리에 맡긴다. */
  const superseded = async () => {
    const [latest] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.relId, rel.id), eq(messages.sender, "user")))
      .orderBy(desc(messages.at), desc(messages.id))
      .limit(1);
    return !!latest && latest.id !== userMsgId;
  };

  const saveReply = async (replyText: string, deliverAt: Date, tag: string | null = null) => {
    if (!replyText.trim()) return null; // 빈 텍스트는 저장하지 않는다(빈 말풍선 방지)
    const [m] = await db
      .insert(messages)
      .values({ relId: rel.id, at: deliverAt, deliverAt, sender: "char", text: replyText, origin: "reply", tag })
      .returning({ id: messages.id });
    await markSeen(replyText, deliverAt);
    // 그의 반응(W11): 위기 대본에는 달지 않는다.
    if (!isSafetyScript(replyText)) {
      await maybeRecordCharReaction(db, { userId, relId: rel.id, userMsgId: userMsg.id, judged, busy: activity.busy, delayMs: deliverAt.getTime() - now.getTime() });
    }
    return m?.id ?? null;
  };
  /**
   * 이 답장이 답하는 사용자 메시지(이 메시지까지, 아직 읽음 표시가 없거나 미래인 것)에 seen_at을 기록한다.
   * 이미 지난 seen_at(화면에 Read로 보인 값)은 F7 재생성에서도 옮기지 않는다.
   */
  const markSeen = async (replyText: string, deliverAt: Date) => {
    const pending = await db
      .select({ id: messages.id, at: messages.at })
      .from(messages)
      .where(
        and(
          eq(messages.relId, rel.id),
          eq(messages.sender, "user"),
          lte(messages.at, userMsg.at),
          or(isNull(messages.seenAt), gt(messages.seenAt, now)),
        ),
      );
    for (const u of pending) {
      const seenAt = seenAtFor(u.id, u.at, deliverAt, replyText.length);
      await db.update(messages).set({ seenAt }).where(eq(messages.id, u.id));
      await moveCharReaction(db, u.id, seenAt, now);
    }
  };

  await logFindings(db, rel.id, userMsg.id, detectBreakers(text));

  // 애정(숨김)·토라짐 반영. 그의 직전 말이 질문이었으면 "답함".
  const { bible, voiceMd, group, engine } = await loadCharacter(db);
  const [lastChar] = await db
    .select({ text: messages.text })
    .from(messages)
    .where(and(eq(messages.relId, rel.id), eq(messages.sender, "char"), lte(messages.deliverAt, now)))
    .orderBy(desc(messages.at))
    .limit(1);
  if (rel.promiseAt) await db.update(relationships).set({ promiseAt: null }).where(eq(relationships.id, rel.id));
  const sulk = await onUserMessageSulk(db, rel.id, now, {
    text,
    silentDays: prev ? silenceDays(now, prev.at, rel.startedAt) : null,
    mode: deps.memoryMode,
    llm: judgeLlm,
  });
  const stage = (await applyUserMessage(db, rel.id, bible, now, !!lastChar?.text.trimEnd().endsWith("?"))).stage;

  const activity = await currentActivity(db, stage, now);
  const [sent] = await db.select({ n: count() }).from(messages).where(and(eq(messages.relId, rel.id), eq(messages.sender, "user")));
  const [live] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.relId, rel.id),
        eq(messages.sender, "char"),
        eq(messages.origin, "reply"),
        lte(messages.deliverAt, now),
        gt(messages.deliverAt, new Date(now.getTime() - LIVE_WINDOW_MIN * 60000)),
      ),
    )
    .limit(1);
  const range = (sent?.n ?? 0) <= FIRST_REPLY_COUNT ? FIRST_REPLY_RANGE : live ? LIVE_REPLY_RANGE : undefined;
  const deliverAt = nextCharacterAt(now, delayMinutes(activity, `${userMsg.id}:delay`, range) * 60000);

  // 그의 반응 후보(W11): rules 모드는 키워드 규칙, llm 모드는 이별 분류 판단 호출의 reaction 필드(추가 호출 없음).
  let judged: string | null = judgeModeOf(deps.memoryMode) === "rules" ? ruleReaction(text) : null;
  const input = guardInput(text, rules);
  await logFindings(db, rel.id, userMsg.id, input.findings);
  // 이별 전이(확인 질문 → 이별 장면). 위기 신호는 안전 대본이 먼저라 분류하지 않는다.
  const turn = input.blocked ? "none" : await breakerTurn(db, getCharacterId(), rel, text, now, {
        mode: deps.memoryMode,
        llm: judgeLlm,
        onReaction: (e) => {
          judged = e;
        },
      });
  if (input.blocked) {
    // 위기 신호: LLM을 거치지 않는 고정 대본. 지연 없이 즉시, 한도는 쓰지 않는다.
    await saveReply(safetyScriptFor(text), nextCharacterAt(now, 0));
  } else if (turn === "asked" || turn === "ended") {
    // 확인 질문·이별 장면은 breakerTurn이 저장했다. 일반 답장·한도 소비 없음.
  } else if (!(await consumeQuota(db, userId, now))) {
    await recordEvent(db, userId, "quota_exhausted", { once: "day", now });
    if (!(await superseded())) await saveReply(pickBusyOverlay(`${rel.id}:${now.toISOString().slice(0, 10)}:${text}`, langOf(text)), deliverAt);
  } else {
    const [u] = await db.select({ tz: users.tz }).from(users).where(eq(users.id, userId)).limit(1);
    const secretNow = await peekSecret(db, rel.id, bible, now, u?.tz ?? null, text);
    const canon = (await db.select().from(canonFacts).where(eq(canonFacts.character, getCharacterId())).orderBy(asc(canonFacts.at))).map(
      (r): CanonRow => ({ at: r.at, character: r.character, fact: r.fact, source: r.source as CanonRow["source"], ...(r.eventId ? { event_id: r.eventId } : {}) }),
    );
    const persona = buildPersona({
      bible,
      group,
      voiceMd,
      canon,
      activity,
      nowKst: formatNowKst(now),
      upcoming: upcomingBlocks(engine, now, { relDay: await relDayOf(db, now), stage }),
      stage,
      memories: await selectMemories(db, rel.id, text),
      profile: profileText(rel.profile),
      sulk: sulkDirective(sulk),
      secretNow,
      disclosed: (await db.select({ id: disclosures.secretId }).from(disclosures).where(eq(disclosures.relId, rel.id))).map((d) => d.id),
    });
    const history = await db
      .select({ sender: messages.sender, text: messages.text })
      .from(messages)
      .where(and(eq(messages.relId, rel.id), lte(messages.deliverAt, now)))
      .orderBy(desc(messages.at))
      .limit(HISTORY_LIMIT);
    const turns: LlmMessage[] = history
      .reverse()
      .map((m) => ({ role: m.sender === "user" ? ("user" as const) : ("assistant" as const), content: m.text }));
    while (turns[0]?.role === "assistant") turns.shift();
    // 그의 마지막 답장 이후 반응·인용(W9·W10). 반응만으로는 답장을 만들지 않는다(여기서 문맥으로만).
    // 첫 7일 장면표: 오늘 보낼 장면이 남아 있으면 이번 답장이 그 장면을 바탕으로 한다(답한 뒤 자연스럽게, 대본 그대로 읽지 않는다).
    const daily = await pendingUserDayScene(db, { id: rel.id, userId, stage, startedAt: rel.startedAt }, getCharacterId(), now);
    const dailyBlock =
      daily && daily.bubbles.length > 0
        ? `\n\n[Private note, not from the user] You planned to bring this up today. First answer what they just said, then work it in naturally in your own words, briefly. Do not quote it, and never mention this note:\n${daily.bubbles.join("\n")}`
        : "";
    const system = persona.system + replyContextBlock(await replyContextLines(db, rel.id, userMsg.at, now)) + dailyBlock;
    try {
      const reply = await generateGuardedReply(
        // F6: thinking 블록이 토큰을 먼저 쓰므로 여유를 둔다. 길이는 persona 지시로 제한
        () => nonEmptyText(() => chatLlm({ model: CHAT_MODEL, maxTokens: 1024, temperature: 0.8, messages: [{ role: "system", content: system }, ...turns] })),
        rules,
        `${userMsg.id}:fallback`,
        fallbackPool(langOf(text)),
      );
      if (await superseded()) {
        // 더 새 메시지의 답장이 이 답장을 대신한다. 한도는 되돌린다.
        await refundQuota(db, userId);
      } else {
        const replyId = await saveReply(reply.text, deliverAt, dailyBlock && daily ? daily.tag : null);
        await logFindings(db, rel.id, replyId, reply.findings);
        if (secretNow) await recordDisclosure(db, rel.id, secretNow.id);
      }
    } catch (e) {
      // LLM 실패(네트워크·4xx·5xx·타임아웃)는 그의 사정으로 처리한다. 앱은 에러를 말하지 않는다.
      // 한도는 되돌리고, 사유에는 상태 코드만 남긴다(토큰·응답 본문 없음).
      await refundQuota(db, userId);
      if (!(await superseded())) {
        const replyId = await saveReply(pickUnavailable(`${userMsg.id}:unavailable`, langOf(text)), deliverAt);
        await logFindings(db, rel.id, replyId, [{ rule_id: "llm_error", severity: "flag", quote: "", reason: llmErrorReason(e) }]);
      }
    }
  }

  // 기억 추출(인라인). 세션이 30분 넘게 끊겼으면 이전 세션 분, 첫 추출은 5건째, 그 뒤 20건마다.
  if (prev && now.getTime() - prev.at.getTime() > SESSION_GAP_MS) await extractMemories(db, rel.id, prev.at, { mode: deps.memoryMode, llm: deps.llm });
  const [cur] = await db.select({ cursor: relationships.memoryCursorAt }).from(relationships).where(eq(relationships.id, rel.id)).limit(1);
  const sinceConds = [eq(messages.relId, rel.id), eq(messages.sender, "user")];
  if (cur?.cursor) sinceConds.push(gt(messages.at, cur.cursor));
  const [n] = await db.select({ n: count() }).from(messages).where(and(...sinceConds));
  if (n && n.n >= (cur?.cursor ? memoryEvery() : memoryFirstAfter())) await extractMemories(db, rel.id, now, { mode: deps.memoryMode, llm: deps.llm });
  await maybeFreezeProfile(db, rel.id, now);
}

/** 사용자 메시지 1건을 받아 그의 답장(전송 지연 포함)까지 저장한다(두 단계를 순서대로). */
export async function handleUserMessage(deps: ChatDeps, userId: string, rawText: string): Promise<SendResult> {
  const r = await recordUserMessage(deps, userId, rawText);
  if (r.status !== "ok") return r.status;
  await generateReplyFor(deps, userId, r.relId, r.userMsgId, rawText);
  return "ok";
}

/** 아직 전달 전인 가장 이른 deliver_at. 없으면 null. */
export async function nextDeliverAt(db: Db, relId: string, now: Date): Promise<Date | null> {
  const [r] = await db
    .select({ at: messages.deliverAt })
    .from(messages)
    .where(and(eq(messages.relId, relId), gt(messages.deliverAt, now)))
    .orderBy(asc(messages.deliverAt))
    .limit(1);
  return r?.at ?? null;
}
