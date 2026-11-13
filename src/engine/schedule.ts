// 생활 일정 엔진. 순수 함수: 파일·네트워크 접근 없음. 같은 입력 → 같은 출력.
import type { Bible, Schedule, Timeline } from "../content/schemas/index.js";

export interface EngineCharacter {
  id: string;
  schedule: Schedule;
  timeline: Timeline;
  affectionStages: Bible["affection_stages"];
}

export interface GrowthState {
  /** t0 기준 상대일(데뷔 직전 = -1) */
  relDay: number;
  /** 애정 단계 1~5 */
  stage: number;
  /** 지금까지 일어난 비트 id. 주어지면 beat.requires를 검사한다 */
  completedBeats?: string[];
  /** 활성 분기 값. beat.branch가 있는 비트는 여기에 있을 때만 적용 */
  branches?: string[];
}

export interface Activity {
  kind: "routine" | "event" | "beat";
  activity: string;
  /** 0~3 */
  busy: number;
  mood: string;
  replyDelayRange: { min: number; max: number };
  canInitiate: boolean;
  /** 사진 situation slug 접두어 목록(schedule.yaml photo_tags). 비트 활동에는 없다. */
  photoTags?: string[];
  /** 오늘 적용된 이벤트/비트 id */
  tags: string[];
}

const KST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 86400000;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const COOLDOWN_DAYS = 3;
const LOOKBACK_DAYS = 10;
const FIXED_EVENT = "monthly_eval_week";
const MOOD_BY_BUSY = ["여유", "차분", "분주", "집중"];

/** FNV-1a 32bit. 의존성 없는 간단한 해시. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const rand01 = (key: string): number => hash32(key) / 0x100000000;

/** 시드 = `${characterId}:${YYYY-MM-DD}` (날짜는 KST) */
export function dailySeed(ns: string, dateStr: string): string {
  return `${ns}:${dateStr}`;
}

function dayIndexToStr(i: number): string {
  return new Date(i * DAY_MS).toISOString().slice(0, 10);
}

/** UTC Date → KST 달력 정보 */
export function kstParts(worldTime: Date): {
  dayIndex: number;
  date: string;
  weekday: number;
  minutes: number;
} {
  const k = worldTime.getTime() + KST_OFFSET_MS;
  const dayIndex = Math.floor(k / DAY_MS);
  const minutes = Math.floor((k - dayIndex * DAY_MS) / 60000);
  return { dayIndex, date: dayIndexToStr(dayIndex), weekday: new Date(dayIndex * DAY_MS).getUTCDay(), minutes };
}

function parseHm(s: string): number {
  const [h, m] = s.split(":");
  return Number(h) * 60 + Number(m);
}

type Block = Schedule["week_template"]["mon"][number];

function findBlock(blocks: Block[], minutes: number): Block {
  for (const b of blocks) {
    const [a, z] = b.time.split("-");
    const start = parseHm(a ?? "0:0") % 1440;
    let end = parseHm(z ?? "0:0");
    if (end <= start) end += 1440;
    if ((minutes >= start && minutes < end) || (minutes + 1440 >= start && minutes + 1440 < end)) return b;
  }
  return blocks[blocks.length - 1] as Block;
}

/** 달의 마지막 금요일이 속한 월~일 주인지 */
function isMonthlyEvalWeek(dayIndex: number): boolean {
  const d = new Date(dayIndex * DAY_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const lastDay = Date.UTC(y, m + 1, 0) / DAY_MS;
  const lastWd = new Date(lastDay * DAY_MS).getUTCDay();
  const lastFriday = lastDay - ((lastWd - 5 + 7) % 7);
  const monday = lastFriday - 4;
  return dayIndex >= monday && dayIndex <= monday + 6;
}

type EventDef = Schedule["random_events"][number];

/** 오늘 걸려 있는 이벤트. 과거 LOOKBACK_DAYS일부터 순서대로 굴려 쿨다운을 적용한다. */
function activeEvents(ns: string, events: EventDef[], today: number): EventDef[] {
  const cooldownUntil = new Map<string, number>();
  const active = new Map<string, EventDef>();
  for (let i = today - LOOKBACK_DAYS; i <= today; i++) {
    for (const ev of events) {
      if (ev.id === FIXED_EVENT) continue;
      if (i < (cooldownUntil.get(ev.id) ?? -Infinity)) continue;
      const key = `${dailySeed(ns, dayIndexToStr(i))}:${ev.id}`;
      if (rand01(key) >= ev.probability) continue;
      const [lo, hi] = ev.duration_days;
      const dur = lo + Math.floor(rand01(`${key}:dur`) * (hi - lo + 1));
      cooldownUntil.set(ev.id, i + dur + COOLDOWN_DAYS);
      if (today >= i && today < i + dur) active.set(ev.id, ev);
    }
  }
  const fixed = events.find((e) => e.id === FIXED_EVENT);
  if (fixed && isMonthlyEvalWeek(today)) active.set(fixed.id, fixed);
  return [...active.values()];
}

/** 비트가 일어나는 날: 창 안에서 id 시드로 하루를 고른다. */
function beatDay(ns: string, beat: Timeline["beats"][number]): number {
  const span = beat.rel_day.max - beat.rel_day.min + 1;
  return beat.rel_day.min + (hash32(`${ns}:beat:${beat.id}`) % span);
}

export function activityAt(
  character: EngineCharacter,
  worldTime: Date,
  growth: GrowthState,
  seed?: string,
): Activity {
  const ns = seed ?? character.id;
  const kst = kstParts(worldTime);
  const key = DAY_KEYS[kst.weekday] as (typeof DAY_KEYS)[number];
  const block = findBlock(character.schedule.week_template[key], kst.minutes);

  const events = activeEvents(ns, character.schedule.random_events, kst.dayIndex);
  const beat = character.timeline.beats.find(
    (b) =>
      (b.branch === null || (growth.branches ?? []).includes(b.branch)) &&
      (growth.completedBeats === undefined || b.requires.every((r) => growth.completedBeats?.includes(r))) &&
      beatDay(ns, b) === growth.relDay,
  );

  let busy = block.busy;
  for (const ev of events) {
    const delta = ev.effect["busy_delta"];
    if (typeof delta === "number") busy += delta;
  }
  if (beat) busy = Math.max(busy, 2);
  busy = Math.min(3, Math.max(0, busy));

  let mood = MOOD_BY_BUSY[busy] as string;
  for (const ev of events) {
    const m = ev.effect["mood"];
    if (typeof m === "string") mood = m;
  }
  if (beat) mood = "특별한 날";

  const stage =
    character.affectionStages.find((s) => s.stage === growth.stage) ?? (character.affectionStages[0] as Bible["affection_stages"][number]);
  const mult = character.schedule.reply_delay_multiplier[String(busy)] ?? 1;
  const replyDelayRange = { min: stage.reply_delay.min_min * mult, max: stage.reply_delay.max_min * mult };

  const asleep = block.time.startsWith("24:00");
  const insomnia = asleep && events.some((e) => e.id === "insomnia") && growth.stage >= 3;
  const canInitiate = insomnia || (busy < 3 && stage.initiative_per_day > 0 && block.initiative_ok);

  const tags = [...events.map((e) => e.id), ...(beat ? [beat.id] : [])];
  return {
    kind: beat ? "beat" : events.length > 0 ? "event" : "routine",
    activity: beat ? beat.public_text : block.activity,
    busy,
    mood,
    replyDelayRange,
    canInitiate,
    ...(!beat && block.photo_tags ? { photoTags: block.photo_tags } : {}),
    tags,
  };
}
