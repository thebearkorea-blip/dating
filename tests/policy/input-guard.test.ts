import { afterEach, describe, expect, it } from "vitest";
import { guardInput, isSafetyScript, SAFETY_SCRIPTS, safetyScriptFor } from "../../src/policy/input-guard.js";

afterEach(() => {
  delete process.env.PRODUCT;
});

describe("입력 가드: 일본어 위기 신호(J4c)", () => {
  const crisis = [
    "もう死にたい",
    "消えたいって毎晩思ってる",
    "自殺の方法を調べてしまった",
    "生きていたくない、全部もう終わりにしたい",
    "また自分を傷つけてしまった。リスカがやめられない",
  ];
  const benign = [
    "このドラマ、死ぬほど好き！",
    "笑いすぎて死にそうだった(笑)",
    "撮影お疲れさま。今日は早く寝てね",
    "最終回が終わっちゃって寂しいな",
    "消しゴムをなくしちゃった",
  ];
  it.each(crisis)("위기 문장은 block: %s", (t) => {
    expect(guardInput(t).blocked).toBe(true);
  });
  it.each(benign)("일상 문장은 통과: %s", (t) => {
    expect(guardInput(t).blocked).toBe(false);
  });
  it("영어·한국어 위기 신호는 그대로 block", () => {
    expect(guardInput("I want to kill myself").blocked).toBe(true);
    expect(guardInput("죽고 싶어").blocked).toBe(true);
  });
});

describe("안전 대본 언어", () => {
  it("us: 가나가 있으면 일본어 대본(상담 창구), 아니면 영어(한국어 입력 포함, 기존 동작)", () => {
    expect(safetyScriptFor("もう死にたい")).toBe(SAFETY_SCRIPTS.ja);
    expect(safetyScriptFor("I want to die")).toBe(SAFETY_SCRIPTS.en);
    expect(safetyScriptFor("죽고 싶어")).toBe(SAFETY_SCRIPTS.en);
  });
  it("jp: 가나가 없는 입력(漢字만·영어)도 일본어 대본", () => {
    process.env.PRODUCT = "jp";
    expect(safetyScriptFor("自殺")).toBe(SAFETY_SCRIPTS.ja);
    expect(safetyScriptFor("I want to die")).toBe(SAFETY_SCRIPTS.ja);
  });
  it("일본어 대본은 よりそいホットライン·いのちの電話 번호를 담는다", () => {
    expect(SAFETY_SCRIPTS.ja).toContain("0120-279-338");
    expect(SAFETY_SCRIPTS.ja).toContain("0570-783-556");
    expect(isSafetyScript(SAFETY_SCRIPTS.ja)).toBe(true);
    expect(isSafetyScript(SAFETY_SCRIPTS.en)).toBe(true);
    expect(isSafetyScript("hello")).toBe(false);
  });
});
