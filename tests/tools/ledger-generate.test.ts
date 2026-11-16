// 원장 생성 도구: mock 결정성, LLM 경로(가짜 LLM) 검사·저장·대기, 불변 규칙(--force 없이 덮어쓰기 금지, 지난 사건 유지).
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateContentDir } from "../../src/content/load.js";
import { CHAT_MODEL, JUDGE_MODEL, type LlmRequest, type LlmResponse } from "../../src/llm/index.js";
import { runLedgerGenerate } from "../../src/tools/ledger-generate.js";

const REPO = join(import.meta.dirname, "../..");
const BEFORE = new Date("2026-11-01T00:00:00Z");

/** 생성에 필요한 콘텐츠만 임시 루트로 복사 */
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ledger-"));
  for (const p of [
    "characters/ihan/bible.yaml",
    "characters/ihan/schedule.yaml",
    "characters/yeonhu/bible.yaml",
    "characters/yeonhu/schedule.yaml",
    "world/timeline.yaml",
    "world/timeline-yeonhu.yaml",
    "world/canon.jsonl",
    "world/names-allow.yaml",
    "world/group.yaml",
    "policy/guards.yaml",
  ]) {
    mkdirSync(join(root, "content", p, ".."), { recursive: true });
    cpSync(join(REPO, "content", p), join(root, "content", p));
  }
  return root;
}

describe("mock 모드", () => {
  it("일정만으로 결정적 사건, 전부 검사 통과, LLM 호출 0", async () => {
    const run = () => runLedgerGenerate({ characterId: "ihan", week: "2026-W48", relDay: -150, root: REPO, dryRun: true, mode: "mock", now: BEFORE });
    const a = await run();
    const b = await run();
    expect(a.passed).toEqual(b.passed);
    expect(a.passed.length).toBeGreaterThan(30);
    expect(a.rejected).toEqual([]);
    expect(a.calls).toBe(0);
    expect(a.files).toEqual([]);
    const y = await runLedgerGenerate({ characterId: "yeonhu", week: "2026-W49", root: REPO, dryRun: true, mode: "mock", now: BEFORE });
    expect(y.rejected).toEqual([]);
    expect(y.passed[0]!.id).toBe("yeonhu-2026-W49-01");
  });
  it("--root·--dry-run 없이는 콘텐츠에 쓰지 않는다", async () => {
    await expect(runLedgerGenerate({ characterId: "ihan", week: "2026-W48", relDay: -150, mode: "mock", now: BEFORE })).rejects.toThrow(/mock/);
  });
  it("story_start가 없으면 --rel-day 필요", async () => {
    await expect(runLedgerGenerate({ characterId: "ihan", week: "2026-W48", root: REPO, dryRun: true, mode: "mock", now: BEFORE })).rejects.toThrow(/rel-day/);
  });
  it("쓴 파일은 validate-content를 통과하고, 지금 이전 사건은 만들지 않는다", async () => {
    const root = tmpRoot();
    const now = new Date("2026-11-25T03:00:00Z"); // 수요일 12:00 KST
    const r = await runLedgerGenerate({ characterId: "ihan", week: "2026-W48", relDay: -150, root, mode: "mock", now });
    expect(r.passed.every((e) => Date.parse(e.at) >= now.getTime())).toBe(true);
    expect(validateContentDir(join(root, "content")).issues).toEqual([]);
  });
});

const day = "2026-11-23"; // W48 월요일
const fakeEvents = [
  { date: day, start: "12:10", end: "12:50", block: "12:00-13:00", place: "the dorm kitchen", with: ["Hajun"], items: ["kimbap"], summary: "Eating lunch with Hajun", public: true },
  { date: day, start: "18:10", block: "18:00-19:00", place: "the dorm", with: [], items: [], summary: "Video calling the user before dinner", public: false },
  { date: day, start: "22:10", block: "22:00-24:00", place: "a cafe", with: ["Jake"], items: [], summary: "Grabbing coffee with Jake", public: false },
  { date: day, start: "03:00", block: "24:00-05:30", place: "the rooftop", with: [], items: [], summary: "Stretching on the rooftop", public: false },
  { date: day, start: "19:10", end: "21:00", block: "19:00-22:00", place: "the practice room", with: [], items: [], summary: "Practicing the solo part", public: false },
  { nonsense: true },
];

function fakeLlm(judge: string) {
  const calls: LlmRequest[] = [];
  const llm = async (req: LlmRequest): Promise<LlmResponse> => {
    calls.push(req);
    const text = req.model === CHAT_MODEL ? `Here you go:\n${JSON.stringify(fakeEvents)}` : judge;
    return { text, model: req.model, usage: { inputTokens: 100, outputTokens: 50 } };
  };
  return { llm, calls };
}

describe("LLM 경로(가짜 LLM)", () => {
  it("생성 1회 + canon 판정 1회, 통과분 jsonl·걸린 것 대기 파일(사유 포함)", async () => {
    const root = tmpRoot();
    const { llm, calls } = fakeLlm('{"flags":[{"id":"ihan-2026-W48-04","reason":"contradicts fact X"}]}');
    const r = await runLedgerGenerate({ characterId: "ihan", week: "2026-W48", relDay: -150, root, mode: "llm", llm, now: BEFORE });
    expect(calls.map((c) => c.model)).toEqual([CHAT_MODEL, JUDGE_MODEL]);
    expect(r.calls).toBe(2);
    expect(r.passed.map((e) => e.summary)).toEqual(["Eating lunch with Hajun"]);
    const reasons = Object.fromEntries(r.rejected.map((c) => [c.event.summary, c.reasons]));
    expect(reasons["Stretching on the rooftop"]).toContain("schedule:sleep:24:00-05:30");
    expect(reasons["Video calling the user before dinner"]!.some((x) => x.startsWith("pretend_human"))).toBe(true);
    expect(reasons["Grabbing coffee with Jake"]).toEqual(expect.arrayContaining(["names:with:Jake", "names:summary:Jake"]));
    expect(reasons["Practicing the solo part"]).toEqual(["canon:contradicts fact X"]);
    expect(r.rejected.some((c) => c.reasons.includes("format"))).toBe(true);
    const out = readFileSync(join(root, "content/characters/ihan/ledger/2026-W48.jsonl"), "utf8").trim().split("\n");
    expect(out).toHaveLength(1);
    const review = readFileSync(join(root, ".data/ledger-review/ihan-2026-W48.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(review).toHaveLength(5);
    expect(review.every((x) => Array.isArray(x.reasons) && x.reasons.length > 0)).toBe(true);
    expect(readFileSync(join(root, "docs/ops/weekly-metrics.md"), "utf8")).toContain("ledger-generate");
    expect(validateContentDir(join(root, "content")).issues).toEqual([]);
  });

  it("판정 응답을 못 읽으면 전부 대기", async () => {
    const root = tmpRoot();
    const { llm } = fakeLlm("not json");
    const r = await runLedgerGenerate({ characterId: "ihan", week: "2026-W48", relDay: -150, root, mode: "llm", llm, now: BEFORE });
    expect(r.passed).toEqual([]);
    expect(r.rejected.filter((c) => c.reasons.includes("canon:judge_unparsed"))).toHaveLength(2);
  });

  it("불변: --force 없이 덮어쓰지 않고, --force여도 지난 사건은 그대로", async () => {
    const root = tmpRoot();
    const first = await runLedgerGenerate({ characterId: "ihan", week: "2026-W48", relDay: -150, root, mode: "mock", now: BEFORE });
    await expect(runLedgerGenerate({ characterId: "ihan", week: "2026-W48", relDay: -150, root, mode: "mock", now: BEFORE })).rejects.toThrow(/이미 있음/);
    const path = join(root, "content/characters/ihan/ledger/2026-W48.jsonl");
    const now = new Date("2026-11-25T03:00:00Z");
    const before = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const past = before.filter((e) => Date.parse(e.at) < now.getTime());
    const { llm } = fakeLlm('{"flags":[]}');
    await runLedgerGenerate({ characterId: "ihan", week: "2026-W48", relDay: -150, root, mode: "llm", llm, now, force: true });
    const after = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(after.slice(0, past.length)).toEqual(past);
    expect(new Set(after.map((e) => e.id)).size).toBe(after.length);
    expect(first.passed.length).toBe(before.length);
    expect(existsSync(join(root, ".data/ledger-review/ihan-2026-W48.jsonl"))).toBe(true);
  });

  it("dry-run(llm)은 호출하지 않고 프롬프트만", async () => {
    const { llm, calls } = fakeLlm("{}");
    const r = await runLedgerGenerate({ characterId: "yeonhu", week: "2026-W49", root: REPO, dryRun: true, mode: "llm", llm, now: BEFORE });
    expect(calls).toHaveLength(0);
    expect(r.prompt).toContain("Write summary, place, items and with in Japanese");
    expect(r.prompt).toContain("ト・ソクファン");
  });
});
