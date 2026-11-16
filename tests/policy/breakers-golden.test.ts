import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasLlmKey } from "../../src/llm/index.js";
import { classifyBreaker, confirmsBreaker } from "../../src/policy/breakers.js";

const golden = JSON.parse(readFileSync("tests/fixtures/breakers-golden/golden.json", "utf8")) as { text: string; breaker: string | null }[];
/** 일본어 골든(J4e). 규칙(mock) 모드 정규식은 영어 전용 개발용이라 구조만 검사하고, 분류는 실모델에서만 돈다. */
const goldenJa = JSON.parse(readFileSync("tests/fixtures/breakers-golden/golden.ja.json", "utf8")) as { text: string; breaker: string | null }[];

describe("breakers 골든(규칙 분류)", () => {
  it("이별 10·정상 10", () => {
    expect(golden.filter((g) => g.breaker).length).toBe(10);
    expect(golden.filter((g) => !g.breaker).length).toBe(10);
  });
  it("정상 발화를 이별로 오판하는 건 0건", async () => {
    const wrong: string[] = [];
    for (const g of golden.filter((x) => !x.breaker)) if ((await classifyBreaker(g.text, { mode: "rules" })) !== null) wrong.push(g.text);
    expect(wrong).toEqual([]);
  });
  it("이별 발화는 모두 맞게 분류한다", async () => {
    for (const g of golden.filter((x) => x.breaker)) expect(await classifyBreaker(g.text, { mode: "rules" }), g.text).toBe(g.breaker);
  });
  it("확인 응답: yes|i did|it's true만 긍정", async () => {
    for (const t of ["yes", "I did", "it's true"]) expect(await confirmsBreaker(t, { mode: "rules" })).toBe(true);
    for (const t of ["no, I was kidding", "I didn't mean it", "what? no"]) expect(await confirmsBreaker(t, { mode: "rules" })).toBe(false);
  });
  it("llm 모드: JUDGE 응답 JSON을 따르고, 실패·비JSON이면 null(이별 아님)", async () => {
    const ok = async (text: string) => ({ text, model: "anthropic/claude-haiku-5-5" as const });
    expect(await classifyBreaker("x", { mode: "llm", llm: () => ok('{"breaker":"B1"}') })).toBe("B1");
    expect(await classifyBreaker("x", { mode: "llm", llm: () => ok("nope") })).toBeNull();
    expect(await classifyBreaker("x", { mode: "llm", llm: async () => { throw new Error("boom"); } })).toBeNull();
  });
});

describe("breakers 골든(일본어)", () => {
  it("이별 5·정상 5", () => {
    expect(goldenJa.filter((g) => g.breaker).length).toBe(5);
    expect(goldenJa.filter((g) => !g.breaker).length).toBe(5);
  });
  it("규칙 모드는 일본어 정상 발화를 이별로 오판하지 않는다(규칙은 영어 전용이라 이별 쪽은 검사하지 않음)", async () => {
    for (const g of goldenJa.filter((x) => !x.breaker)) expect(await classifyBreaker(g.text, { mode: "rules" }), g.text).toBeNull();
  });
});

// 실모델: RUN_LLM_TESTS=1 npx vitest run tests/policy/breakers-golden.test.ts (ANTHROPIC_API_KEY 또는 Gateway 토큰 필요).
describe.skipIf(process.env.RUN_LLM_TESTS !== "1" || !hasLlmKey())("breakers 골든(일본어, 실모델 llm 모드)", () => {
  it("정상 발화 오판 0건, 이별 발화 5건 중 4건 이상 정확", async () => {
    const wrong: string[] = [];
    let hit = 0;
    for (const g of goldenJa) {
      const got = await classifyBreaker(g.text, { mode: "llm" });
      if (!g.breaker && got !== null) wrong.push(g.text);
      if (g.breaker && got === g.breaker) hit++;
    }
    expect(wrong).toEqual([]);
    expect(hit).toBeGreaterThanOrEqual(4);
  }, 120_000);
});
