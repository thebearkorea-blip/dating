// 삶 원장(M3) 읽기. content/characters/<id>/ledger/<ISO주>.jsonl. 원장이 없으면 null/[]를 돌려주고 호출자는 기존 동작(일정·일기)으로 간다.
// 채팅 persona·화면 활동 한 줄·선톡 소재는 모두 eventAt(같은 시각 → 같은 사건)을 거친다. 부재 복귀는 eventsBetween, SNS 큐는 publicEventsBetween.
// 파일 규칙(불변·지난 사건 수정 금지)은 src/content/schemas/ledger.ts 머리말.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ledgerEventSchema, type LedgerEvent } from "../content/schemas/ledger.js";
import { kstParts, type Activity } from "./schedule.js";

export type { LedgerEvent };

const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 3600000;

/** KST 날짜 일련번호(1970-01-01 = 0) → ISO 요일 1(월)~7(일) */
const isoWeekday = (dayIndex: number): number => ((((dayIndex + 3) % 7) + 7) % 7) + 1;

/** KST 기준 ISO 주. 예: 2026-11-17(화) → "2026-W47" */
export function isoWeekOf(worldTime: Date): string {
  const day = kstParts(worldTime).dayIndex;
  const thursday = day - isoWeekday(day) + 4;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1) / DAY_MS;
  const week = Math.floor((thursday - jan1) / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** ISO 주의 월요일 KST 날짜 일련번호. 형식이 틀리면 throw. */
export function isoWeekMonday(week: string): number {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new Error(`ISO 주 형식 아님: ${week} (예: 2026-W47)`);
  const jan4 = Date.UTC(Number(m[1]), 0, 4) / DAY_MS;
  return jan4 - (isoWeekday(jan4) - 1) + (Number(m[2]) - 1) * 7;
}

/** KST 날짜 일련번호 + "HH:MM" → UTC Date */
export function kstDate(dayIndex: number, minutes = 0): Date {
  return new Date(dayIndex * DAY_MS + minutes * 60000 - KST_OFFSET_MS);
}

/** UTC Date → "YYYY-MM-DDTHH:MM:00+09:00" */
export function toKstIso(t: Date): string {
  const k = kstParts(t);
  const hh = String(Math.floor(k.minutes / 60)).padStart(2, "0");
  const mm = String(k.minutes % 60).padStart(2, "0");
  return `${k.date}T${hh}:${mm}:00+09:00`;
}

export function ledgerPath(characterId: string, week: string, root = "content"): string {
  return join(root, "characters", characterId, "ledger", `${week}.jsonl`);
}

const cache = new Map<string, { mtime: number; events: LedgerEvent[] }>();

/** 주 파일 하나. 없으면 []. 깨진 줄은 건너뛴다(검증은 validate-content 몫). 파일 순서를 지킨다. */
export function loadLedgerWeek(characterId: string, week: string, root = "content"): LedgerEvent[] {
  const path = ledgerPath(characterId, week, root);
  if (!existsSync(path)) return [];
  const mtime = statSync(path).mtimeMs;
  const hit = cache.get(path);
  if (hit && hit.mtime === mtime) return hit.events;
  const events = readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .flatMap((l) => {
      try {
        const r = ledgerEventSchema.safeParse(JSON.parse(l));
        return r.success ? [r.data] : [];
      } catch {
        return [];
      }
    });
  cache.set(path, { mtime, events });
  return events;
}

/** [from, to] 구간에 걸치는 주 파일의 사건 전부(시각 순, 같은 시각은 파일 순). */
function eventsInWeeks(characterId: string, from: Date, to: Date, root: string): LedgerEvent[] {
  const weeks = new Set<string>();
  for (let t = from.getTime(); t < to.getTime(); t += 7 * DAY_MS) weeks.add(isoWeekOf(new Date(t)));
  weeks.add(isoWeekOf(to));
  return [...weeks]
    .flatMap((w) => loadLedgerWeek(characterId, w, root))
    .map((e, i) => ({ e, i, at: Date.parse(e.at) }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map(({ e }) => e);
}

/** 지금 그의 사건. 덮는 사건 중 가장 늦게 시작한 것(같으면 파일에서 뒤의 것). 없으면 null.
 * 덮는다 = at ≤ now 이고, until이 있으면 now < until, 없으면 같은 KST 날짜이면서 그 뒤 now까지 시작한 다른 사건이 없음.
 * 지난주 파일도 본다(일요일 밤에 시작해 월요일 새벽까지 이어지는 사건). */
export function eventAt(characterId: string, now: Date, root = "content"): LedgerEvent | null {
  const t = now.getTime();
  const events = eventsInWeeks(characterId, new Date(t - DAY_MS), now, root);
  const starts = events.map((e) => Date.parse(e.at));
  let hit: LedgerEvent | null = null;
  events.forEach((e, i) => {
    const at = starts[i] as number;
    if (at > t) return;
    const covers = e.until
      ? t < Date.parse(e.until)
      : kstParts(new Date(at)).dayIndex === kstParts(now).dayIndex && !starts.some((s, j) => j !== i && s > at && s <= t);
    if (covers) hit = e;
  });
  return hit;
}

/** at이 (from, to]인 사건(시각 순). 원장이 없으면 []. */
export function eventsBetween(characterId: string, from: Date, to: Date, root = "content"): LedgerEvent[] {
  if (to.getTime() <= from.getTime()) return [];
  return eventsInWeeks(characterId, from, to, root).filter((e) => {
    const at = Date.parse(e.at);
    return at > from.getTime() && at <= to.getTime();
  });
}

/** SNS 큐 소재: (from, to]의 public 사건. make-post-pack 큐를 채울 때 이것만 쓴다(비공개 사건은 1:1 채팅에만). */
export function publicEventsBetween(characterId: string, from: Date, to: Date, root = "content"): LedgerEvent[] {
  return eventsBetween(characterId, from, to, root).filter((e) => e.public);
}

/** SNS 큐가 now 시점에 고르는 사건: 지금 사건이 public이면 그것, 아니면 null. persona·선톡과 같은 사건을 본다. */
export function publicEventAt(characterId: string, now: Date, root = "content"): LedgerEvent | null {
  const e = eventAt(characterId, now, root);
  return e?.public ? e : null;
}

/** 활동에 지금 사건을 붙인다(currentActivity가 부른다). 원장이 없으면 활동 그대로. */
export function withLedger(activity: Activity, characterId: string, now: Date, root = "content"): Activity {
  const e = eventAt(characterId, now, root);
  return e ? { ...activity, ledgerEvent: e } : activity;
}

/** 한 줄 요약: "summary (place; with A, B)". 선톡 소재·부재 복귀 문맥에 같은 모양으로 쓴다. */
export function eventContext(e: LedgerEvent): string {
  return `${e.summary} (${[e.place, ...(e.with.length ? [`with ${e.with.join(", ")}`] : [])].join("; ")})`;
}
