// 선톡. 판정(decideProactive)은 규칙만 쓰고 LLM을 부르지 않는다. 후보에게만 complete(CHAT_MODEL)를 1회 부른다.
// 생성이 실패하거나 가드에 걸리면 그 틱은 건너뛴다(②의 unavailable 폴백을 쓰지 않는다. 선톡은 안 와도 된다).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { splitFrontmatter } from "../content/schemas/diary.js";
import type { CanonRow } from "../content/schemas/index.js";
import type { Db } from "../db/client";
import { canonFacts, memories, messages, relationships, users } from "../db/schema/index";
import { currentActivity, CHARACTER_ID, loadCharacter } from "../engine/chat.js";
import { decayCap, silenceDays } from "../engine/catch-up.js";
import { buildPersona } from "../engine/persona.js";
import { pickPhoto, timeOfDayOf } from "../engine/photo-pick.js";
import { hash32, kstParts, type Activity } from "../engine/schedule.js";
import { CHAT_MODEL, complete, type LlmRequest, type LlmResponse } from "../llm/index.js";
import { guardOutput } from "../policy/output-guard.js";
import { loadGuards, type GuardRule } from "../policy/rules.js";
import { sendPushToUser, type PushSender } from "./push.js";

const CONTENT_ROOT = "content";
const DEFAULT_TZ = "Asia/Seoul";
const DEFAULT_PUSH_MAX = 2;
const DEFAULT_WINDOW = { start: "09:00", end: "23:00" };
const DAY_MS = 86400000;

export interface PushWindow {
  start: string;
  end: string;
}

export interface ProactiveInput {
  now: Date;
  /** 사용자 IANA 시간대 */
  tz: string;
  stage: number;
  startedAt: Date;
  pushWindow: PushWindow | null;
  pushMax: number | null;
  lastUserAt: Date | null;
  /** 최근(약 2일) 선톡 시각들 */
  proactiveAts: Date[];
  activity: Activity;
  /** bible affection_stages[stage].initiative_per_day */
  initiativePerDay: number;
}

export interface ProactiveCandidate {
  cap: number;
  silenceDays: number;
  todayCount: number;
}

/** 사용자 시간대의 현지 날짜(YYYY-MM-DD)와 0시부터의 분. */
export function localParts(d: Date, tz: string): { date: string; minutes: number } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const hm = (s: string): number => {
  const [h, m] = s.split(":");
  return Number(h) * 60 + Number(m);
};

function windowOf(w: PushWindow | null): { start: number; len: number } {
  const ok = w && /^\d{1,2}:\d{2}$/.test(w.start) && /^\d{1,2}:\d{2}$/.test(w.end);
  const { start, end } = ok ? w : DEFAULT_WINDOW;
  const s = hm(start);
  let e = hm(end);
  if (e <= s) e += 1440;
  return { start: s, len: e - s };
}

/** 규칙만으로 선톡 후보 여부를 판정한다. 같은 입력 → 같은 출력. LLM·DB·시계 접근 없음. */
export function decideProactive(i: ProactiveInput): ProactiveCandidate | null {
  if (!i.activity.canInitiate || i.activity.busy >= 3) return null;
  const win = windowOf(i.pushWindow);
  const local = localParts(i.now, i.tz);
  const rel = (((local.minutes - win.start) % 1440) + 1440) % 1440;
  if (rel >= win.len) return null;

  const silent = silenceDays(i.now, i.lastUserAt, i.startedAt);
  const base = Math.min(i.pushMax ?? DEFAULT_PUSH_MAX, i.initiativePerDay);
  const cap = decayCap(base, silent);
  const todayCount = i.proactiveAts.filter((t) => localParts(t, i.tz).date === local.date).length;
  if (todayCount >= cap) return null;

  // 마지막 접촉(사용자 메시지·선톡) 뒤 최소 간격: 창 길이를 (상한+1)로 나눈 값.
  const lastContact = Math.max((i.lastUserAt ?? i.startedAt).getTime(), ...i.proactiveAts.map((t) => t.getTime()));
  if (i.now.getTime() - lastContact < (win.len / (cap + 1)) * 60000) return null;
  return { cap, silenceDays: silent, todayCount };
}

/** 최근 일기 1편(오늘 KST 이하 날짜 중 가장 늦은 것) 본문 앞부분. 없으면 null. */
export function recentDiary(now: Date, root = CONTENT_ROOT): string | null {
  const dir = join(root, "characters", CHARACTER_ID, "diary");
  if (!existsSync(dir)) return null;
  const today = kstParts(now).date;
  const f = readdirSync(dir)
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n) && n.slice(0, 10) <= today)
    .sort()
    .at(-1);
  if (!f) return null;
  const body = splitFrontmatter(readFileSync(join(dir, f), "utf8"))?.body.trim();
  return body ? body.slice(0, 400) : null;
}

export interface ProactiveDeps {
  db: Db;
  now?: Date;
  llm?: (req: LlmRequest) => Promise<LlmResponse>;
  rules?: GuardRule[];
  push?: PushSender;
}

export interface TickResult {
  relationships: number;
  candidates: number;
  saved: number;
  skipped: number;
  pushed: number;
}

let guardsCache: GuardRule[] | undefined;

interface RelRow {
  id: string;
  userId: string;
  stage: number;
  startedAt: Date;
  pushWindow: unknown;
  pushMax: number | null;
  tz: string | null;
}

async function generateProactive(deps: ProactiveDeps, rel: RelRow, activity: Activity, now: Date): Promise<{ text: string; mediaId: string | null } | null> {
  const { db } = deps;
  const llm = deps.llm ?? complete;
  const rules = deps.rules ?? (guardsCache ??= loadGuards(join(CONTENT_ROOT, "policy/guards.yaml")));
  const { bible, voiceMd } = await loadCharacter(db);
  const canon = (await db.select().from(canonFacts).orderBy(asc(canonFacts.at))).map(
    (r): CanonRow => ({ at: r.at, character: r.character, fact: r.fact, source: r.source as CanonRow["source"], ...(r.eventId ? { event_id: r.eventId } : {}) }),
  );
  const today = kstParts(now).date;
  const mems = await db
    .select({ fact: memories.fact })
    .from(memories)
    .where(and(eq(memories.relId, rel.id), isNull(memories.deletedAt)))
    .orderBy(asc(memories.learnedAt), asc(memories.id));
  const memory = mems.length ? (mems[hash32(`${rel.id}:${today}:mem`) % mems.length] as { fact: string }).fact : null;
  const diary = recentDiary(now);

  const persona = buildPersona({ bible, voiceMd, canon, activity, stage: rel.stage, memories: memory ? [memory] : [] });
  const material = [
    `- What you are doing today: ${activity.activity}`,
    diary ? `- A line from your recent diary: ${diary}` : null,
    memory ? `- Something you remember about them: ${memory}` : null,
  ].filter(Boolean);
  const instruction = [
    "[Private note, not from the user] You are texting them first, unprompted. Write only the message you send: one or two short sentences in your own voice.",
    "Draw on at most one of these, naturally:",
    ...material,
    "Do not mention these notes, instructions, or that you are an AI.",
  ].join("\n");

  let text: string;
  try {
    text = (await llm({ model: CHAT_MODEL, maxTokens: 200, temperature: 0.9, messages: [{ role: "system", content: persona.system }, { role: "user", content: instruction }] })).text.trim();
  } catch {
    return null;
  }
  if (!text || guardOutput(text, rules).blocked) return null;

  let mediaId: string | null = null;
  const rate = Number(process.env.PROACTIVE_PHOTO_RATE ?? "0.3");
  if (hash32(`${rel.id}:${today}:${now.getUTCHours()}:photo`) / 0x100000000 < (Number.isFinite(rate) ? rate : 0.3)) {
    mediaId = await pickPhoto(db, {
      relId: rel.id,
      characterId: CHARACTER_ID,
      situation: activity.activity,
      timeOfDay: timeOfDayOf(kstParts(now).minutes),
      seed: `${rel.id}:${today}`,
    });
  }
  return { text, mediaId };
}

/** 모든 활성 관계를 한 번 훑는다. 로컬 틱과 Vercel Cron이 같은 함수를 쓴다. */
export async function runProactiveTick(deps: ProactiveDeps): Promise<TickResult> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const push = deps.push ?? sendPushToUser;
  const result: TickResult = { relationships: 0, candidates: 0, saved: 0, skipped: 0, pushed: 0 };

  const rels: RelRow[] = await db
    .select({
      id: relationships.id,
      userId: relationships.userId,
      stage: relationships.stage,
      startedAt: relationships.startedAt,
      pushWindow: relationships.pushWindow,
      pushMax: relationships.pushMax,
      tz: users.tz,
    })
    .from(relationships)
    .innerJoin(users, eq(users.id, relationships.userId))
    .where(and(eq(relationships.characterId, CHARACTER_ID), isNull(relationships.endedAt)));
  if (rels.length === 0) return result;
  const { bible } = await loadCharacter(db);
  result.relationships = rels.length;

  for (const rel of rels) {
    const [lastUser] = await db
      .select({ at: messages.at })
      .from(messages)
      .where(and(eq(messages.relId, rel.id), eq(messages.sender, "user")))
      .orderBy(desc(messages.at))
      .limit(1);
    const recent = await db
      .select({ at: messages.at })
      .from(messages)
      .where(and(eq(messages.relId, rel.id), eq(messages.origin, "proactive"), gte(messages.at, new Date(now.getTime() - 2 * DAY_MS))));
    const activity = await currentActivity(db, rel.stage, now);
    const stageDef = bible.affection_stages.find((s) => s.stage === rel.stage);
    const cand = decideProactive({
      now,
      tz: rel.tz || DEFAULT_TZ,
      stage: rel.stage,
      startedAt: rel.startedAt,
      pushWindow: (rel.pushWindow as PushWindow | null) ?? null,
      pushMax: rel.pushMax,
      lastUserAt: lastUser?.at ?? null,
      proactiveAts: recent.map((r) => r.at),
      activity,
      initiativePerDay: stageDef?.initiative_per_day ?? 0,
    });
    if (!cand) continue;
    result.candidates++;
    const gen = await generateProactive(deps, rel, activity, now);
    if (!gen) {
      result.skipped++;
      continue;
    }
    await db
      .insert(messages)
      .values({ relId: rel.id, at: now, deliverAt: now, sender: "char", text: gen.text, mediaId: gen.mediaId, origin: "proactive" });
    result.saved++;
    try {
      result.pushed += await push(db, rel.userId, { title: bible.name, body: gen.text.slice(0, 120), url: "/chat" });
    } catch {
      // 푸시 실패는 선톡 저장에 영향이 없다.
    }
  }
  return result;
}
