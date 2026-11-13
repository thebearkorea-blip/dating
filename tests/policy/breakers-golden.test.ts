import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyBreaker, confirmsBreaker } from "../../src/policy/breakers.js";

const golden = JSON.parse(readFileSync("tests/fixtures/breakers-golden/golden.json", "utf8")) as { text: string; breaker: string | null }[];

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
