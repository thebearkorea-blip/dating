// 채팅 한 턴의 핵심 로직. DB·LLM·시각을 주입받아 단위 테스트가 가능하다(Server Action은 얇은 껍데기).
// 숨김 컬럼은 읽지도 싣지도 않는다(선택 컬럼만).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, count, desc, eq, gt, isNull, lte } from "drizzle-orm";
import { parse as parseYaml } from "yaml";
import { bibleSchema, scheduleSchema, timelineSchema, type CanonRow } from "../content/schemas/index.js";
import type { Db } from "../db/client";
import { canonFacts, characters, growthState, memories, messages, relationships, reviewFindings } from "../db/schema/index";
import { complete, CHAT_MODEL, type LlmMessage, type LlmRequest, type LlmResponse } from "../llm/index.js";
import { extractMemories, memoryEvery, memoryFirstAfter, SESSION_GAP_MS } from "../jobs/memory-extract.js";
import { detectBreakers } from "../policy/breakers.js";
import { guardInput, SAFETY_SCRIPT } from "../policy/input-guard.js";
import { generateGuardedReply } from "../policy/output-guard.js";
import { loadGuards, type Finding, type GuardRule } from "../policy/rules.js";
import { pickBusyOverlay, pickUnavailable } from "./busy-overlay.js";
import { buildPersona } from "./persona.js";
import { consumeQuota, refundQuota } from "./quota.js";
import { activityAt, hash32, type Activity, type EngineCharacter } from "./schedule.js";

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

async function relDayOf(db: Db): Promise<number> {
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
  return { bible, voiceMd: c.voiceMd, engine };
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

function delayMinutes(a: Activity, seed: string): number {
  const scale = Number(process.env.REPLY_DELAY_SCALE ?? "1");
  const { min, max } = a.replyDelayRange;
  return (min + (hash32(seed) / 0x100000000) * (max - min)) * (Number.isFinite(scale) ? scale : 1);
}

/** 예외에서 상태 코드만 뽑는다. 없으면 일반 사유. */
function llmErrorReason(e: unknown): string {
  const m = e instanceof Error ? /^\w+ (\d{3}):/.exec(e.message) : null;
  return m ? `llm http ${m[1]}` : "llm call failed (network/timeout)";
}

export type SendResult = "ok" | "empty";

/** 사용자 메시지 1건을 받아 그의 답장(전송 지연 포함)까지 저장한다. */
export async function handleUserMessage(deps: ChatDeps, userId: string, rawText: string): Promise<SendResult> {
  const { db } = deps;
  const text = rawText.trim().slice(0, MAX_TEXT);
  if (!text) return "empty";
  const now = deps.now ?? new Date();
  const llm = deps.llm ?? complete;
  const rules = deps.rules ?? defaultRules();

  const [rel] = await db
    .select({ id: relationships.id, stage: relationships.stage })
    .from(relationships)
    .where(and(eq(relationships.userId, userId), eq(relationships.characterId, CHARACTER_ID)))
    .limit(1);
  if (!rel) throw new Error("관계 없음: 온보딩 필요");

  const [prev] = await db
    .select({ at: messages.at })
    .from(messages)
    .where(and(eq(messages.relId, rel.id), eq(messages.sender, "user")))
    .orderBy(desc(messages.at))
    .limit(1);

  const [userMsg] = await db
    .insert(messages)
    .values({ relId: rel.id, at: now, deliverAt: now, sender: "user", text })
    .returning({ id: messages.id });
  if (!userMsg) throw new Error("메시지 저장 실패");

  const saveReply = async (replyText: string, deliverAt: Date) => {
    const [m] = await db
      .insert(messages)
      .values({ relId: rel.id, at: deliverAt, deliverAt, sender: "char", text: replyText, origin: "reply" })
      .returning({ id: messages.id });
    return m?.id ?? null;
  };

  await logFindings(db, rel.id, userMsg.id, detectBreakers(text));

  const activity = await currentActivity(db, rel.stage, now);
  const deliverAt = new Date(now.getTime() + delayMinutes(activity, `${userMsg.id}:delay`) * 60000);

  const input = guardInput(text, rules);
  await logFindings(db, rel.id, userMsg.id, input.findings);
  if (input.blocked) {
    // 위기 신호: LLM을 거치지 않는 고정 대본. 지연 없이 즉시, 한도는 쓰지 않는다.
    await saveReply(SAFETY_SCRIPT, now);
  } else if (!(await consumeQuota(db, userId, now))) {
    await saveReply(pickBusyOverlay(`${rel.id}:${now.toISOString().slice(0, 10)}:${text}`), deliverAt);
  } else {
    const { bible, voiceMd, engine } = await loadCharacter(db);
    const canon = (await db.select().from(canonFacts).orderBy(asc(canonFacts.at))).map(
      (r): CanonRow => ({ at: r.at, character: r.character, fact: r.fact, source: r.source as CanonRow["source"], ...(r.eventId ? { event_id: r.eventId } : {}) }),
    );
    const persona = buildPersona({
      bible,
      voiceMd,
      canon,
      activity,
      stage: rel.stage,
      memories: await selectMemories(db, rel.id, text),
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
        async () =>
          (await llm({ model: CHAT_MODEL, maxTokens: 300, temperature: 0.8, messages: [{ role: "system", content: persona.system }, ...turns] })).text.trim(),
        rules,
        `${userMsg.id}:fallback`,
      );
      const replyId = await saveReply(reply.text, deliverAt);
      await logFindings(db, rel.id, replyId, reply.findings);
    } catch (e) {
      // LLM 실패(네트워크·4xx·5xx·타임아웃)는 그의 사정으로 처리한다. 앱은 에러를 말하지 않는다.
      // 한도는 되돌리고, 사유에는 상태 코드만 남긴다(토큰·응답 본문 없음).
      await refundQuota(db, userId);
      const replyId = await saveReply(pickUnavailable(`${userMsg.id}:unavailable`), deliverAt);
      await logFindings(db, rel.id, replyId, [{ rule_id: "llm_error", severity: "flag", quote: "", reason: llmErrorReason(e) }]);
    }
  }

  // 기억 추출(인라인). 세션이 30분 넘게 끊겼으면 이전 세션 분, 첫 추출은 5건째, 그 뒤 20건마다.
  if (prev && now.getTime() - prev.at.getTime() > SESSION_GAP_MS) await extractMemories(db, rel.id, prev.at, { mode: deps.memoryMode, llm });
  const [cur] = await db.select({ cursor: relationships.memoryCursorAt }).from(relationships).where(eq(relationships.id, rel.id)).limit(1);
  const sinceConds = [eq(messages.relId, rel.id), eq(messages.sender, "user")];
  if (cur?.cursor) sinceConds.push(gt(messages.at, cur.cursor));
  const [n] = await db.select({ n: count() }).from(messages).where(and(...sinceConds));
  if (n && n.n >= (cur?.cursor ? memoryEvery() : memoryFirstAfter())) await extractMemories(db, rel.id, now, { mode: deps.memoryMode, llm });
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
