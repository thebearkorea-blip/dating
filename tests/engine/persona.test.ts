import { describe, expect, it } from "vitest";
import { buildPersona } from "../../src/engine/persona.js";
import { activityAt } from "../../src/engine/schedule.js";
import { bible, character, voiceMd } from "./helpers.js";

const canon = Array.from({ length: 40 }, (_, i) => ({
  at: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
  character: "ihan",
  fact: `fact number ${i}`,
  source: "diary" as const,
}));
const act = (stage: number) => activityAt(character, new Date("2026-12-01T03:00:00Z"), { relDay: -150, stage });
const build = (stage: number) => buildPersona({ bible, voiceMd, canon, activity: act(stage), stage });

describe("buildPersona", () => {
  it("prefix is byte-identical for the same input and across stages", () => {
    expect(build(2).cacheable_prefix).toBe(build(2).cacheable_prefix);
    expect(build(1).cacheable_prefix).toBe(build(5).cacheable_prefix);
  });

  it("includes only the 30 most recent canon rows", () => {
    const p = build(2).cacheable_prefix;
    expect(p.split("\n").filter((l) => l.startsWith("- [2026-10-")).length).toBe(30);
  });

  it("contains no model strings", () => {
    const p = build(3);
    expect(p.system).not.toMatch(/claude|anthropic|sonnet|haiku/i);
  });

  it("suffix differs by stage; secrets only via one-time directive + disclosed id list", () => {
    expect(build(1).dynamic_suffix).not.toBe(build(3).dynamic_suffix);
    expect(build(3).dynamic_suffix).not.toContain("S1");
    const p = buildPersona({ bible, voiceMd, canon, activity: act(2), stage: 3, secretNow: { id: "S2", text: "secret two text" }, disclosed: ["S1"] });
    expect(p.dynamic_suffix).toContain("secret two text");
    expect(p.dynamic_suffix).toContain("S1");
  });

  it("system = prefix + suffix, tokens = chars/4, optional layers go to suffix", () => {
    const p = buildPersona({ bible, voiceMd, canon, activity: act(2), stage: 2, profile: "likes jazz", memories: ["went hiking"] });
    expect(p.system).toBe(`${p.cacheable_prefix}\n\n${p.dynamic_suffix}`);
    expect(p.tokens_estimate).toBe(Math.ceil(p.system.length / 4));
    expect(p.dynamic_suffix).toContain("likes jazz");
    expect(p.dynamic_suffix).toContain("went hiking");
    expect(p.cacheable_prefix).not.toContain("went hiking");
  });

  it("suffix carries a stage-specific length directive", () => {
    expect(build(1).dynamic_suffix).toContain("1–2 short sentences (max ~40 words). One question at most.");
    expect(build(3).dynamic_suffix).toContain("1–3 sentences.");
    expect(build(5).dynamic_suffix).toContain("occasionally longer at night");
    const sulky = buildPersona({ bible, voiceMd, canon, activity: act(1), stage: 1, sulk: "a bit hurt" });
    expect(sulky.dynamic_suffix).toContain("one short sentence");
  });

  it("adds the 24h schedule section only when upcoming is given", () => {
    const upcoming = [{ startKst: "09:00", dayLabel: "내일", activity: "보호소 산책(콩)" }];
    const p = buildPersona({ bible, voiceMd, canon, activity: act(2), stage: 2, upcoming });
    expect(p.dynamic_suffix).toContain("# 앞으로 24시간 일정");
    expect(p.dynamic_suffix).toContain("- 내일 09:00 보호소 산책(콩)");
    expect(build(2).dynamic_suffix).not.toContain("앞으로 24시간");
  });
});
