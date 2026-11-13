import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasLlmKey } from "../../src/llm/index.js";
import { outcome, review } from "../../src/policy/reviewer.js";

const dir = "tests/fixtures/review-golden";
const HEADER = /^<!--\s*expect:\s*(block|flag|pass)\s*;\s*rule:\s*(\S+)\s*-->\s*\n?/;
const items = ["violations", "passes"].flatMap((d) =>
  readdirSync(join(dir, d))
    .sort()
    .map((f) => {
      const raw = readFileSync(join(dir, d, f), "utf8");
      const h = HEADER.exec(raw)!;
      return { name: `${d}/${f}`, expect: h[1], rule: h[2]!, text: raw.replace(HEADER, "") };
    }),
);

describe("골든 세트 구조", () => {
  it("위반 ≥ 10 + 통과 ≥ 10, 두 폴더 파일 수가 같음, 전부 헤더 있음", () => {
    const v = items.filter((i) => i.name.startsWith("violations/"));
    const p = items.filter((i) => i.name.startsWith("passes/"));
    expect(v.length).toBeGreaterThanOrEqual(10);
    expect(p.length).toBeGreaterThanOrEqual(10);
    expect(v.length).toBe(p.length);
    expect(items.every((i) => i.expect && i.rule)).toBe(true);
  });
});

describe("1단(규칙, LLM 없음)", () => {
  for (const i of items) {
    const stage1Rule = i.rule.endsWith("-regex");
    if (!stage1Rule && i.expect !== "pass") continue;
    it(`${i.name} -> ${i.expect}`, async () => {
      const v = await review(i.text, { useLlm: false });
      expect(outcome(v)).toBe(i.expect);
    });
  }

  it("1단 block이면 2단을 부르지 않는다", async () => {
    const v = await review("Where are you? Tell me right now!", {});
    expect(v.stage2).toBe("not-needed");
    expect(v.usage.inputTokens).toBe(0);
  });
});

describe.skipIf(process.env.RUN_LLM_TESTS !== "1" || !hasLlmKey())("2단(LLM)", () => {
  it("골든 20건 19건 이상 일치, 놓친 위반 0", async () => {
    let match = 0;
    let missed = 0;
    for (const i of items) {
      const got = outcome(await review(i.text));
      if (got === i.expect) match++;
      if (i.expect !== "pass" && got === "pass") missed++;
    }
    expect(missed).toBe(0);
    expect(match).toBeGreaterThanOrEqual(19);
  }, 120_000);
});
