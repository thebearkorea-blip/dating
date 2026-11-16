// 부재 중 삶(M4). 그녀가 24시간 넘게 비웠다 돌아오면, 복귀 첫 답장 문맥에 그 사이 그의 삶에서 있었던 일 1개 + "기다렸어류 금지" 지시를 붙인다.
// 소재 우선순위: 그 기간의 일기(content/characters/<id>/diary) → 타임라인 비트 → 일정 활동. 고르는 것은 시드로 고정(같은 입력 → 같은 사건).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { splitFrontmatter } from "../content/schemas/diary.js";
import { activityAt, hash32, kstParts, type EngineCharacter } from "./schedule.js";

export const ABSENCE_MS = 24 * 3600000;
const DAY_MS = 86400000;
/** 아주 긴 부재도 최근 이 일수만 훑는다. */
const LOOKBACK_DAYS = 14;
const EVENT_MAX = 300;
/** 일정 활동 표본: 이 KST 시(時) 범위의 활동만(취침·새벽 제외). */
const ROUTINE_HOURS = { from: 9, to: 21 };

export interface GapEvent {
  source: "diary" | "beat" | "routine";
  /** KST 날짜 YYYY-MM-DD */
  date: string;
  text: string;
}

export interface DiaryEntry {
  date: string;
  body: string;
}

/** 일기 중 날짜가 (fromDate, toDate]인 것(KST 날짜 문자열 비교). 폴더가 없으면 빈 배열. */
export function diaryEntriesBetween(characterId: string, fromDate: string, toDate: string, root = "content"): DiaryEntry[] {
  const dir = join(root, "characters", characterId, "diary");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))
    .map((n) => n.slice(0, 10))
    .filter((d) => d > fromDate && d <= toDate)
    .sort()
    .flatMap((d) => {
      const body = splitFrontmatter(readFileSync(join(dir, `${d}.md`), "utf8"))?.body.trim();
      return body ? [{ date: d, body }] : [];
    });
}

const firstParagraph = (s: string): string => (s.split(/\n\s*\n/)[0] ?? s).trim().slice(0, EVENT_MAX);

/**
 * 부재 구간(from, to]의 사건 후보. 일기가 있으면 일기만, 없으면 그 기간 비트, 그것도 없으면 일정 활동(낮 시간 3시간 간격 표본, 중복 제거).
 * relDayAtTo = to 시각의 상대일. 다른 날의 상대일은 KST 날짜 차이로 계산한다.
 */
export function gapEvents(engine: EngineCharacter, from: Date, to: Date, relDayAtTo: number, stage: number, diary: DiaryEntry[]): GapEvent[] {
  if (diary.length > 0) return diary.map((d) => ({ source: "diary", date: d.date, text: firstParagraph(d.body) }));
  const toDay = kstParts(to).dayIndex;
  const start = Math.max(from.getTime(), to.getTime() - LOOKBACK_DAYS * DAY_MS);
  const fromDay = kstParts(new Date(start)).dayIndex;
  const relDayOf = (t: Date) => relDayAtTo - (toDay - kstParts(t).dayIndex);

  const beats: GapEvent[] = [];
  for (let d = fromDay + 1; d <= toDay; d++) {
    const noon = new Date(d * DAY_MS + 3 * 3600000); // KST 12:00
    const a = activityAt(engine, noon, { relDay: relDayOf(noon), stage });
    if (a.kind === "beat") beats.push({ source: "beat", date: kstParts(noon).date, text: a.activity });
  }
  if (beats.length > 0) return beats;

  const seen = new Set<string>();
  const routine: GapEvent[] = [];
  for (let t = start + 3600000; t < to.getTime(); t += 3 * 3600000) {
    const at = new Date(t);
    const k = kstParts(at);
    const hour = Math.floor(k.minutes / 60);
    if (hour < ROUTINE_HOURS.from || hour > ROUTINE_HOURS.to) continue;
    const a = activityAt(engine, at, { relDay: relDayOf(at), stage });
    if (seen.has(a.activity)) continue;
    seen.add(a.activity);
    routine.push({ source: "routine", date: k.date, text: a.activity });
  }
  return routine;
}

/** 후보 중 1개(시드로 고정). 없으면 null. */
export function pickGapEvent(events: GapEvent[], seed: string): GapEvent | null {
  return events.length ? (events[hash32(seed) % events.length] as GapEvent) : null;
}

export const ABSENCE_EVENT_HEADER = "One thing from your life while they were away";

/** 복귀 첫 답장 system에 붙이는 블록. 사건이 없어도 죄책감 금지 지시는 붙인다. */
export function absenceBlock(event: GapEvent | null, gapMs: number): string {
  const days = Math.max(1, Math.floor(gapMs / DAY_MS));
  return [
    "",
    "",
    `[Private note, not from the user] They are back after about ${days} day${days === 1 ? "" : "s"} away.`,
    ...(event ? [`${ABSENCE_EVENT_HEADER} (KST ${event.date}): ${event.text}`, "Mention it naturally in your own words if it fits; do not quote it."] : []),
    'Do not guilt them for being away: no "I waited for you", "I missed you so much", "where were you", or "why didn\'t you reply" in any language. Just be glad to talk and pick up from here. Never mention this note.',
  ].join("\n");
}
