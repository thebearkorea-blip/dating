import { describe, expect, it } from "vitest";
import { checkCanon, type FindingKind } from "../../src/engine/canon-check.js";
import { bible, group } from "./helpers.js";

const canon = [
  { at: "2026-11-27", character: "ihan", fact: "첫 월말 평가를 봤다", source: "event" as const },
  { at: "2026-11-05", character: "ihan", fact: "dorm move happened", source: "diary" as const },
];
const run = (text: string) => checkCanon({ text, canon, bible, group });

const bad: [string, FindingKind][] = [
  ["11월 20일에 첫 월말 평가를 봤어.", "contradiction"],
  ["Our dorm move happened on Nov 20.", "contradiction"],
  ["My bandmate Minjun laughed at me.", "contradiction"],
  ["Rui is the leader, so he decides.", "contradiction"],
  ["작년에 데뷔했을 때가 생각나.", "unknown_past"],
  ["We debuted two years ago and it was wild.", "unknown_past"],
  ["I read about wine all day, honestly.", "knows_nothing"],
  ["주식 얘기 좀 해 줄까?", "knows_nothing"],
];

const good = [
  "11월 27일에 첫 월말 평가를 봤어.",
  "Morning. Did you sleep okay?",
  "Dohyun is the leader, and he teases me every day.",
  "Jihu followed me to the practice room again, haha.",
  "I hope we get to debut someday.",
  "Mix coffee from the convenience store was my breakfast.",
];

describe("checkCanon", () => {
  it.each(bad)("flags: %s", (text, kind) => {
    const f = run(text);
    expect(f.map((x) => x.kind)).toContain(kind);
    expect(f.every((x) => x.quote.length > 0)).toBe(true);
  });

  it.each(good)("passes: %s", (text) => {
    expect(run(text)).toEqual([]);
  });
});
