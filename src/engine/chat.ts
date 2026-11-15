// 채팅 한 턴의 핵심 로직. DB·LLM·시각을 주입받아 단위 테스트가 가능하다(Server Action은 얇은 껍데기).
// 숨김 컬럼은 읽지도 싣지도 않는다(선택 컬럼만).
import { readdirSync, readFileSync } from "node:fs";
import { now as clockNow } from "../clock";
import { join } from "node:path";
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, lte } from "drizzle-orm";
import { parse as parseYaml } from "yaml";
import { bibleSchema, groupSchema, scheduleSchema, timelineSchema, type CanonRow, type Group } from "../content/schemas/index.js";
import type { Db } from "../db/client";
import { canonFacts, characters, disclosures, growthState, memories, messages, relationships, reviewFindings, users } from "../db/schema/index";
import { complete, CHAT_MODEL, type LlmMessage, type LlmRequest, type LlmResponse } from "../llm/index.js";
import { trackedLlm } from "../llm/tracked.js";
import { extractMemories, memoryEvery, memoryFirstAfter, SESSION_GAP_MS } from "../jobs/memory-extract.js";
import { detectBreakers } from "../policy/breakers.js";
import { guardInput, SAFETY_SCRIPT } from "../policy/input-guard.js";
import { generateGuardedReply } from "../policy/output-guard.js";
import { loadGuards, type Finding, type GuardRule } from "../policy/rules.js";
import { applyUserMessage } from "./affection.js";
import { recordEvent } from "./events.js";
import { scenesByTrigger } from "./scenes.js";
import { breakerTurn, nextCharacterAt } from "./breakup.js";
import { BUSY_OVERLAY_LINES, pickBusyOverlay, pickUnavailable, UNAVAILABLE_LINES } from "./busy-overlay.js";
import { silenceDays } from "./catch-up.js";
import { buildPersona } from "./persona.js";
import { maybeFreezeProfile, profileText } from "./profile.js";
import { consumeQuota, refundQuota } from "./quota.js";
import { activityAt, formatNowKst, hash32, upcomingBlocks, type Activity, type EngineCharacter } from "./schedule.js";
import { peekSecret, recordDisclosure } from "./secrets.js";
import { onUserMessageSulk, sulkDirective } from "./sulk.js";

export const CHARACTER_ID = "ihan";
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

let timelineCache: EngineCharacter["timeline"] | undefined;
function timeline(): EngineCharacter["timeline"] {
  timelineCache ??= timelineSchema.parse(parseYaml(readFileSync(join(CONTENT_ROOT, "world/timeline.yaml"), "utf8")));
  return timelineCache;
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

export async function relDayOf(db: Db): Promise<number> {
  const [g] = await db.select({ d: growthState.currentRelDay }).from(growthState).where(eq(growthState.id, 1)).limit(1);
  return g?.d ?? DEFAULT_REL_DAY;
}

export async function loadCharacter(db: Db) {
  const [c] = await db.select().from(characters).where(eq(characters.id, CHARACTER_ID)).limit(1);
  if (!c) throw new Error("캐릭터 데이터 없음: load-content를 먼저 실행하세요");
  const bible = bibleSchema.parse(c.bible);
  const engine: EngineCharacter = {
    id: c.id,
    schedule: scheduleSchema.parse(c.schedule),
    timeline: timeline(),
    affectionStages: bible.affection_stages,
  };
  return { bible, voiceMd: c.voiceMd, engine, group: loadGroup(bible.group_id) };
}

/** 지금 그의 활동(바쁨·답장 지연 범위). */
export async function currentActivity(db: Db, stage: number, now: Date): Promise<Activity> {
  const { engine } = await loadCharacter(db);
  return activityAt(engine, now, { relDay: await relDayOf(db), stage });
}

/** 화면 상단 한 줄. 숫자·내부 값 없이 응답 가능 시간감만. */
export function activityLine(a: Activity): string {
  if (a.busy >= 3) return "He's tied up right now — replies may take a while";
  if (a.busy === 2) return "He's in the middle of practice — replies may be slow";
  if (a.busy === 1) return "He's got a few things going on, but he'll get back to you";
  return "He's free for now";
}

const WORD = /[\p{L}\p{N}]+/gu;
const STOP = new Set(["the", "and", "you", "for", "that", "with", "have", "are", "was", "not", "but", "this", "what", "just", "like", "from", "your", "about", "they", "can", "his", "her", "its", "had", "has", "did", "does", "will", "would", "there", "been", "were", "into", "then", "than", "them"]);
function words(s: string): Set<string> {
  return new Set((s.toLowerCase().match(WORD) ?? []).filter((w) => w.length >= 3 && !STOP.has(w)));
}

/** 최근 10건 + 사용자 메시지와 단어 2개 이상 겹치는 기억. 삭제된 기억은 제외. */
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

export type SendResult = "ok" | "empty" | "ended";

export type RecordResult = { status: "ok"; relId: string; userMsgId: string } | { status: "empty" | "ended"; relId: null; userMsgId: null };

/** 1단계: 사용자 메시지만 저장한다(+first_message). 화면에 바로 보이도록 LLM은 부르지 않는다. */
export async function recordUserMessage(deps: ChatDeps, userId: string, rawText: string): Promise<RecordResult> {
  const { db } = deps;
  const text = rawText.trim().slice(0, MAX_TEXT);
  if (!text) return { status: "empty", relId: null, userMsgId: null };
  const now = deps.now ?? clockNow();
  const [rel] = await db
    .select({ id: relationships.id, endedAt: relationships.endedAt })
    .from(relationships)
    .where(and(eq(relationships.userId, userId), eq(relationships.characterId, CHARACTER_ID)))
    .limit(1);
  if (!rel) throw new Error("관계 없음: 온보딩 필요");
  // 이별 뒤에는 대화를 받지 않는다(재시작은 reconcile 화면).
  if (rel.endedAt) return { status: "ended", relId: null, userMsgId: null };
  const [userMsg] = await db
    .insert(messages)
    .values({ relId: rel.id, at: now, deliverAt: now, sender: "user", text })
    .returning({ id: messages.id });
  if (!userMsg) throw new Error("메시지 저장 실패");
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
  const keep = new Set<string>([SAFETY_SCRIPT]);
  for (const s of scenesByTrigger(CHARACTER_ID, "breaker_confirmed")) {
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
  const free = new Set<string>([...BUSY_OVERLAY_LINES, ...UNAVAILABLE_LINES]);
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

  const saveReply = async (replyText: string, deliverAt: Date) => {
    if (!replyText.trim()) return null; // 빈 텍스트는 저장하지 않는다(빈 말풍선 방지)
    const [m] = await db
      .insert(messages)
      .values({ relId: rel.id, at: deliverAt, deliverAt, sender: "char", text: replyText, origin: "reply" })
      .returning({ id: messages.id });
    return m?.id ?? null;
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

  const input = guardInput(text, rules);
  await logFindings(db, rel.id, userMsg.id, input.findings);
  // 이별 전이(확인 질문 → 이별 장면). 위기 신호는 안전 대본이 먼저라 분류하지 않는다.
  const turn = input.blocked ? "none" : await breakerTurn(db, CHARACTER_ID, rel, text, now, { mode: deps.memoryMode, llm: judgeLlm });
  if (input.blocked) {
    // 위기 신호: LLM을 거치지 않는 고정 대본. 지연 없이 즉시, 한도는 쓰지 않는다.
    await saveReply(SAFETY_SCRIPT, nextCharacterAt(now, 0));
  } else if (turn === "asked" || turn === "ended") {
    // 확인 질문·이별 장면은 breakerTurn이 저장했다. 일반 답장·한도 소비 없음.
  } else if (!(await consumeQuota(db, userId, now))) {
    await recordEvent(db, userId, "quota_exhausted", { once: "day", now });
    if (!(await superseded())) await saveReply(pickBusyOverlay(`${rel.id}:${now.toISOString().slice(0, 10)}:${text}`), deliverAt);
  } else {
    const [u] = await db.select({ tz: users.tz }).from(users).where(eq(users.id, userId)).limit(1);
    const secretNow = await peekSecret(db, rel.id, bible, now, u?.tz ?? null, text);
    const canon = (await db.select().from(canonFacts).orderBy(asc(canonFacts.at))).map(
      (r): CanonRow => ({ at: r.at, character: r.character, fact: r.fact, source: r.source as CanonRow["source"], ...(r.eventId ? { event_id: r.eventId } : {}) }),
    );
    const persona = buildPersona({
      bible,
      group,
      voiceMd,
      canon,
      activity,
      nowKst: formatNowKst(now),
      upcoming: upcomingBlocks(engine, now, { relDay: await relDayOf(db), stage }),
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
    try {
      const reply = await generateGuardedReply(
        // F6: thinking 블록이 토큰을 먼저 쓰므로 여유를 둔다. 길이는 persona 지시로 제한
        () => nonEmptyText(() => chatLlm({ model: CHAT_MODEL, maxTokens: 1024, temperature: 0.8, messages: [{ role: "system", content: persona.system }, ...turns] })),
        rules,
        `${userMsg.id}:fallback`,
      );
      if (await superseded()) {
        // 더 새 메시지의 답장이 이 답장을 대신한다. 한도는 되돌린다.
        await refundQuota(db, userId);
      } else {
        const replyId = await saveReply(reply.text, deliverAt);
        await logFindings(db, rel.id, replyId, reply.findings);
        if (secretNow) await recordDisclosure(db, rel.id, secretNow.id);
      }
    } catch (e) {
      // LLM 실패(네트워크·4xx·5xx·타임아웃)는 그의 사정으로 처리한다. 앱은 에러를 말하지 않는다.
      // 한도는 되돌리고, 사유에는 상태 코드만 남긴다(토큰·응답 본문 없음).
      await refundQuota(db, userId);
      if (!(await superseded())) {
        const replyId = await saveReply(pickUnavailable(`${userMsg.id}:unavailable`), deliverAt);
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
