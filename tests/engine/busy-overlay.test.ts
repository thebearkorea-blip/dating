import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { linesSchema } from "../../src/content/schemas/lines.js";
import { validateYamlText } from "../../src/content/load.js";
import { characterLines, fallbackPool, freeLines, langOf, pickBusyOverlay, pickUnavailable } from "../../src/engine/busy-overlay.js";

afterEach(() => {
  delete process.env.PRODUCT;
});

describe("busy-overlay 언어 선택", () => {
  it("langOf: 한글 포함이면 ko, 가나 포함이면 ja, 아니면 제품 기본 언어(us en)", () => {
    expect(langOf("왜 영어로 이야기하지")).toBe("ko");
    expect(langOf("hi 안녕")).toBe("ko");
    expect(langOf("hello there")).toBe("en");
    expect(langOf("今日はありがとう")).toBe("ja");
    expect(langOf("カフェ")).toBe("ja");
  });
  it("langOf: jp 제품은 가나·한글 없는 문장(이모지·영어)도 ja", () => {
    process.env.PRODUCT = "jp";
    expect(langOf("ok 😂")).toBe("ja");
    expect(langOf("自殺")).toBe("ja");
  });
  it("pickBusyOverlay(seed, ko)는 한국어 풀에서 고른다", () => {
    expect(characterLines("ihan").busy_overlay.ko).toContain(pickBusyOverlay("seed-1", "ko"));
  });
  it("미국판 이한: ja 풀이 없으면 제품 기본 언어(en) 풀로 대신한다", () => {
    expect(characterLines("ihan").busy_overlay.en).toContain(pickBusyOverlay("seed-1", "ja"));
    expect(fallbackPool("ko", "ihan")).toEqual(characterLines("ihan").fallback.en);
  });
  it("일본판 연후: ja 풀에서 고른다", () => {
    const l = characterLines("yeonhu");
    expect(l.busy_overlay.ja).toContain(pickBusyOverlay("s", "ja", "yeonhu"));
    expect(l.unavailable.ja).toContain(pickUnavailable("s", "ja", "yeonhu"));
  });
  it("환불 집합은 모든 언어의 한도 소진·실패 문장을 포함하고 폴백은 넣지 않는다", () => {
    const free = freeLines("ihan");
    const l = characterLines("ihan");
    for (const s of [...l.busy_overlay.en!, ...l.busy_overlay.ko!, ...l.unavailable.en!, ...l.unavailable.ko!]) expect(free.has(s)).toBe(true);
    for (const s of l.fallback.en!) expect(free.has(s)).toBe(false);
  });
});

describe("lines.yaml 스키마", () => {
  it("이한·연후 lines.yaml이 스키마를 통과한다", () => {
    for (const id of ["ihan", "yeonhu"]) {
      expect(validateYamlText(readFileSync(`content/characters/${id}/lines.yaml`, "utf8"), linesSchema), id).toEqual([]);
    }
  });
  it("언어 풀이 하나도 없거나 모르는 키가 있으면 거부한다", () => {
    const activity = "activity: { en: { busy3: a, busy2: b, busy1: c, free: d } }";
    expect(validateYamlText(`busy_overlay: {}\nunavailable: { en: [x] }\nfallback: { en: [x] }\n${activity}`, linesSchema)).not.toEqual([]);
    expect(validateYamlText(`busy_overlay: { fr: [x] }\nunavailable: { en: [x] }\nfallback: { en: [x] }\n${activity}`, linesSchema)).not.toEqual([]);
    expect(validateYamlText(`busy_overlay: { en: [x] }\nunavailable: { en: [x] }\nfallback: { en: [x] }\n${activity}`, linesSchema)).toEqual([]);
  });
});
