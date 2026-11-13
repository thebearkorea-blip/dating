import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { validateDiaryText } from "../../src/content/load.js";
import { diaryFrontmatterSchema } from "../../src/content/schemas/index.js";
import { approveDiary, BlockedDraftError } from "../../src/tools/diary-approve.js";
import { defaultRelDay, parseTopics, renderDraft, runDraft } from "../../src/tools/diary-draft.js";

const ROOT = resolve(import.meta.dirname, "../..");
const fm = { date: "2026-11-20", rel_day: 20, activity: "convenience store", mood: "calm", photos: [] as string[], audience: "public" as const };

function sandbox(outcomeName: string): string {
  const root = mkdtempSync(join(tmpdir(), "diary-"));
  mkdirSync(join(root, "content/characters/ihan/diary/_drafts"), { recursive: true });
  writeFileSync(join(root, "content/characters/ihan/diary/_queue.json"), "[]\n");
  writeFileSync(
    join(root, "content/characters/ihan/diary/_drafts/2026-11-20-1.md"),
    renderDraft({ frontmatter: fm, body: "Quiet night." }, { outcome: outcomeName, findings: [], canon_check: [] }),
  );
  return root;
}

describe("diary frontmatter 스키마", () => {
  const ok = "---\ndate: 2026-11-20\nrel_day: 20\nactivity: x\nmood: y\nphotos: []\naudience: public\n---\nbody\n";
  it("정상", () => {
    expect(validateDiaryText(ok, "2026-11-20")).toEqual([]);
  });
  it("strict: 모르는 키·잘못된 audience 거부", () => {
    expect(diaryFrontmatterSchema.safeParse({ ...fm, extra: 1 }).success).toBe(false);
    expect(diaryFrontmatterSchema.safeParse({ ...fm, audience: "private" }).success).toBe(false);
  });
  it("파일명과 date 불일치 거부", () => {
    expect(validateDiaryText(ok, "2026-11-21")).not.toEqual([]);
  });
});

describe("diary-approve", () => {
  it("block 초안은 승인 거부(함수)", async () => {
    const root = sandbox("block");
    await expect(approveDiary({ date: "2026-11-20", pick: 1, root, useLlm: false })).rejects.toBeInstanceOf(BlockedDraftError);
    expect(existsSync(join(root, "content/characters/ihan/diary/2026-11-20.md"))).toBe(false);
  });
  it("block 초안은 CLI에서 exit 1", () => {
    const root = sandbox("block");
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", join(ROOT, "src/tools/diary-approve.ts"), "--date", "2026-11-20", "--pick", "1"],
      { cwd: root, encoding: "utf8" },
    );
    expect(r.status).toBe(1);
    expect(existsSync(join(root, "content/characters/ihan/diary/2026-11-20.md"))).toBe(false);
  });
  it("pass 초안은 저장·큐 추가(키 없이 사실 추출 건너뜀)", async () => {
    const root = sandbox("pass");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await approveDiary({ date: "2026-11-20", pick: 1, root, useLlm: false });
    warn.mockRestore();
    expect(r.extracted).toBe(false);
    const saved = readFileSync(r.diaryPath, "utf8");
    expect(validateDiaryText(saved, "2026-11-20")).toEqual([]);
    const q = JSON.parse(readFileSync(join(root, "content/characters/ihan/diary/_queue.json"), "utf8")) as { date: string; posted: boolean }[];
    expect(q).toMatchObject([{ date: "2026-11-20", posted: false }]);
  });
});

describe("diary-draft --dry-run", () => {
  it("프롬프트 토큰 수를 출력한다(LLM 호출 없음)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await runDraft({ date: "2026-11-20", n: 1, dryRun: true, root: ROOT });
    const out = log.mock.calls.map((c) => String(c[0])).join("\n");
    log.mockRestore();
    expect(out).toMatch(/프롬프트 토큰 추정: \d+/);
    expect(r.promptTokens).toBeGreaterThan(0);
    expect(r.files).toEqual([]);
  });
});

describe("diary-topics 파서", () => {
  it("표 맨 끝 rel_day 열을 relDay로 읽는다", () => {
    const md = "| D1 | 주제 | 활동 | tag-a, tag-b | 없음 | -180 |\n| D30 | 주제2 | 활동2 | tag-c | 없음 | -151 |\n";
    const t = parseTopics(md);
    expect(t.map((x) => x.relDay)).toEqual([-180, -151]);
    expect(t[0]).toMatchObject({ topic: "주제", scheduleActivity: "활동", photoTags: "tag-a, tag-b" });
  });
  it("기본 rel_day는 -181 + min(30, day)", () => {
    expect(defaultRelDay("2026-11-20")).toBe(-161);
    expect(defaultRelDay("2026-12-31")).toBe(-151);
  });
});
