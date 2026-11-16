import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { bibleSchema, scheduleSchema, timelineSchema } from "../../src/content/schemas/index.js";
import { activityAt, blockAt, dailySeed, isSleepBlock, kstParts, upcomingBlocks, type EngineCharacter } from "../../src/engine/schedule.js";
import { character, timeline } from "./helpers.js";

const g = { relDay: -150, stage: 2 };

describe("activityAt", () => {
  it("is deterministic for the same input", () => {
    const t = new Date("2026-12-01T03:00:00Z");
    expect(activityAt(character, t, g)).toEqual(activityAt(character, t, g));
  });

  it("converts UTC to KST (2026-12-01T20:00Z is 12-02 05:00 KST)", () => {
    expect(kstParts(new Date("2026-12-01T20:00:00Z")).date).toBe("2026-12-02");
    expect(dailySeed("ihan", "2026-12-02")).toBe("ihan:2026-12-02");
  });

  it("returns a result for every hour of 7 days", () => {
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const a = activityAt(character, new Date(Date.UTC(2026, 11, 7 + d, h)), g);
        expect(a.activity.length).toBeGreaterThan(0);
        expect(a.busy).toBeGreaterThanOrEqual(0);
        expect(a.busy).toBeLessThanOrEqual(3);
      }
    }
  });

  it("busy 3 has a longer reply delay cap than busy 0, and no initiative", () => {
    // 2026-12-08 화 11:00 KST 단체 연습(busy 3), 12:30 KST 점심(busy 0). 이벤트 영향 없는 날을 찾는다.
    let hi, lo;
    for (let d = 0; d < 30 && !(hi && lo); d++) {
      const a = activityAt(character, new Date(Date.UTC(2026, 11, 8 + d, 2)), g); // 11:00 KST
      const b = activityAt(character, new Date(Date.UTC(2026, 11, 8 + d, 3, 30)), g); // 12:30 KST
      if (a.busy === 3 && b.busy === 0 && a.tags.length === 0 && b.tags.length === 0) [hi, lo] = [a, b];
    }
    expect(hi).toBeDefined();
    expect(lo).toBeDefined();
    expect(hi!.replyDelayRange.max).toBeGreaterThan(lo!.replyDelayRange.max);
    expect(hi!.canInitiate).toBe(false);
  });

  it("a timeline beat overrides the weekly activity on its day", () => {
    const beat = timeline.beats.find((b) => b.id === "debut_group_confirmed")!;
    const hit = Array.from({ length: beat.rel_day.max - beat.rel_day.min + 1 }, (_, i) => beat.rel_day.min + i).filter(
      (r) => activityAt(character, new Date("2026-12-01T03:00:00Z"), { relDay: r, stage: 1 }).kind === "beat",
    );
    expect(hit).toHaveLength(1);
    const a = activityAt(character, new Date("2026-12-01T03:00:00Z"), { relDay: hit[0]!, stage: 1 });
    expect(a.activity).toBe(beat.public_text);
    expect(a.busy).toBeGreaterThanOrEqual(2);
  });

  it("applies the monthly eval week (last Friday's week) busy +1", () => {
    // 2026-11-27(금)이 11월 마지막 금요일. 저녁 개인 연습(busy 2) → 3
    const evalWeek = activityAt(character, new Date("2026-11-24T11:00:00Z"), g); // 11-24 20:00 KST
    expect(evalWeek.tags).toContain("monthly_eval_week");
    expect(evalWeek.busy).toBe(3);
  });

  it("respects the cooldown: same random event does not start twice within 3 days", () => {
    const ids = ["cold", "late_practice", "sibling_call", "member_dinner", "insomnia", "camera_practice", "manager_notice"];
    const days: string[][] = [];
    for (let d = 0; d < 120; d++) {
      const a = activityAt(character, new Date(Date.UTC(2026, 0, 1 + d, 3)), g);
      days.push(a.tags.filter((t) => ids.includes(t)));
    }
    for (const id of ids) {
      const idx = days.flatMap((t, i) => (t.includes(id) ? [i] : []));
      // 1일짜리 이벤트는 연속 날에 나타날 수 없다(지속 1일 + 쿨다운 3일)
      if (id !== "cold") for (let i = 1; i < idx.length; i++) expect(idx[i]! - idx[i - 1]!).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("upcomingBlocks", () => {
  it("returns only activity change points within 24h, merged, with day labels", () => {
    const from = new Date("2026-12-05T13:00:00Z"); // 토 22:00 KST
    const blocks = upcomingBlocks(character, from, g);
    expect(blocks.length).toBeGreaterThan(0);
    let prev = activityAt(character, from, g).activity;
    for (const b of blocks) {
      expect(b.activity).not.toBe(prev);
      prev = b.activity;
      expect(b.startKst).toMatch(/^\d{2}:00$/);
    }
    expect(blocks.some((b) => b.dayLabel === "내일")).toBe(true);
  });
});

// 취침 판정은 isSleepBlock과 같은 규칙: 연후는 00:30에 자므로 "24:00" 시작만 보면 새벽 불면 선톡이 막힌다.
describe("취침 블록 불면 선톡", () => {
  const C = join(import.meta.dirname, "../../content");
  const y = (p: string): unknown => parse(readFileSync(join(C, p), "utf8"));
  const yBible = bibleSchema.parse(y("characters/yeonhu/bible.yaml"));
  const yeonhu: EngineCharacter = {
    id: yBible.id,
    schedule: scheduleSchema.parse(y("characters/yeonhu/schedule.yaml")),
    timeline: timelineSchema.parse(y("world/timeline-yeonhu.yaml")),
    affectionStages: yBible.affection_stages,
  };
  const rel = -150;
  // KST hh:mm의 UTC 시각(KST = UTC+9)
  const kst = (d: number, hh: number, mm: number) => new Date(Date.UTC(2026, 0, d, hh - 9, mm));

  function scan(c: EngineCharacter, hh: number, mm: number) {
    let insomniaDays = 0;
    let plainDays = 0;
    for (let d = 1; d <= 120; d++) {
      const t = kst(d, hh, mm);
      if (!isSleepBlock(blockAt(c.schedule, t, rel))) continue;
      const s3 = activityAt(c, t, { relDay: rel, stage: 3 });
      const s2 = activityAt(c, t, { relDay: rel, stage: 2 });
      if (s3.tags.includes("insomnia")) {
        insomniaDays++;
        expect(s3.canInitiate).toBe(true);
        expect(s2.canInitiate).toBe(false); // 단계 3 미만은 불면이어도 선톡 없음
      } else {
        plainDays++;
        expect(s3.canInitiate).toBe(false);
      }
    }
    return { insomniaDays, plainDays };
  }

  it("연후 00:45 KST: 취침 중이라 선톡 불가, 불면 이벤트(단계 3+)면 가능", () => {
    const r = scan(yeonhu, 0, 45);
    expect(r.plainDays).toBeGreaterThan(0);
    expect(r.insomniaDays).toBeGreaterThan(0);
  });

  it("연후 07:00 KST: 취침 중이라 선톡 불가, 불면 이벤트(단계 3+)면 가능", () => {
    const r = scan(yeonhu, 7, 0);
    expect(r.plainDays).toBeGreaterThan(0);
    expect(r.insomniaDays).toBeGreaterThan(0);
  });

  it("이한은 그대로: 24:00 시작 취침 블록(00:30)에서 같은 규칙", () => {
    const r = scan(character, 0, 30);
    expect(r.plainDays).toBeGreaterThan(0);
    expect(r.insomniaDays).toBeGreaterThan(0);
  });
});
