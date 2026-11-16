import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { bibleSchema, scheduleSchema, timelineSchema } from "../../src/content/schemas/index.js";
import { activityAt, type EngineCharacter } from "../../src/engine/schedule.js";

const C = join(import.meta.dirname, "../../content");
const y = (p: string): unknown => parse(readFileSync(join(C, p), "utf8"));
const bible = bibleSchema.parse(y("characters/yeonhu/bible.yaml"));
const yeonhu: EngineCharacter = {
  id: "yeonhu",
  schedule: scheduleSchema.parse(y("characters/yeonhu/schedule.yaml")),
  timeline: timelineSchema.parse({ beats: [] }),
  affectionStages: bible.affection_stages,
};
// 2026-12-01(화) 11:00 KST = 02:00Z. 이벤트 영향이 없는 날로 맞추려고 busy·활동명만 본다(이벤트는 busy_delta만 더한다).
const TUE_11 = new Date("2026-12-01T02:00:00Z");
const act = (relDay: number, t = TUE_11) => activityAt(yeonhu, t, { relDay, stage: 1 });

describe("schedule phases (yeonhu)", () => {
  it("준비기·촬영기·홍보기가 같은 화요일 11시에 서로 다른 활동", () => {
    const names = [-150, -100, -10].map((d) => act(d).activity);
    expect(new Set(names).size).toBe(3);
    expect(names[0]).toContain("대본 분석");
    expect(names[1]).toContain("촬영");
    expect(names[2]).toContain("후시녹음");
  });
  it("범위 양 끝 포함: -121은 준비기, -120은 촬영기", () => {
    expect(act(-121).activity).toContain("대본 분석");
    expect(act(-120).activity).toContain("촬영");
    expect(act(-31).activity).toContain("촬영");
    expect(act(-30).activity).toContain("후시녹음");
    expect(act(0).activity).toContain("후시녹음");
  });
  it("단계 밖(D+1 이후)은 기본 week_template", () => {
    expect(act(5).activity).toBe(act(-150).activity);
  });
  it("월요일 휴일은 모든 단계에서 선톡 가능한 낮", () => {
    const mon = new Date("2026-11-30T05:00:00Z"); // 월 14:00 KST
    for (const d of [-150, -100, -10]) expect(activityAt(yeonhu, mon, { relDay: d, stage: 1 }).canInitiate).toBe(true);
  });
  it("phases 없는 일정(ihan)은 week_template 그대로", () => {
    const ihan = scheduleSchema.parse(y("characters/ihan/schedule.yaml"));
    expect(ihan.phases).toBeUndefined();
  });
});
