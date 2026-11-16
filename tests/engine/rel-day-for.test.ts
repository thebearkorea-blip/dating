import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { phaseActivityLines, relDayFor, relDayFromStoryStart } from "../../src/engine/chat.js";
import { characterLines } from "../../src/engine/busy-overlay.js";

const db = drizzle(new PGlite(), { schema });
vi.mock("@/db/client", () => ({ getDb: () => db }));

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});

describe("relDayFromStoryStart", () => {
  it("시작일 = D-180, 하루마다 +1 (KST)", () => {
    expect(relDayFromStoryStart("2026-12-01", new Date("2026-12-01T00:00:00+09:00"))).toBe(-180);
    expect(relDayFromStoryStart("2026-12-01", new Date("2026-12-02T00:00:00+09:00"))).toBe(-179);
    expect(relDayFromStoryStart("2026-12-01", new Date("2027-05-29T12:00:00+09:00"))).toBe(-1);
  });
  it("시작 전은 -180으로 고정", () => {
    expect(relDayFromStoryStart("2026-12-01", new Date("2026-11-17T12:00:00+09:00"))).toBe(-180);
  });
});

describe("relDayFor", () => {
  it("story_start 있는 캐릭터(yeonhu): 날짜 기준, 출시 전 -180", async () => {
    expect(await relDayFor(db as never, "yeonhu", new Date("2026-11-17T12:00:00+09:00"))).toBe(-180);
    expect(await relDayFor(db as never, "yeonhu", new Date("2026-12-11T12:00:00+09:00"))).toBe(-170);
  });
  it("story_start 없는 캐릭터(ihan): 전역 값(없으면 기본 -150)", async () => {
    expect(await relDayFor(db as never, "ihan", new Date("2030-01-01T00:00:00Z"))).toBe(-150);
  });
});

describe("activityLine 단계별 문구", () => {
  const ja = characterLines("yeonhu").activity.ja!;
  it("rel_day 범위의 문구, 범위 밖·미지정이면 평문", () => {
    expect(phaseActivityLines(ja, -150).busy3).toContain("リーディング");
    expect(phaseActivityLines(ja, -121).busy3).toContain("リーディング");
    expect(phaseActivityLines(ja, -120).busy3).toContain("撮影");
    expect(phaseActivityLines(ja, -10).busy3).toContain("収録");
    expect(phaseActivityLines(ja, 5).busy3).toBe(ja.busy3);
    expect(phaseActivityLines(ja).busy3).toBe(ja.busy3);
  });
  it("평문만 있는 캐릭터(ihan)는 그대로", () => {
    const en = characterLines("ihan").activity.en!;
    expect(en.phases).toBeUndefined();
    expect(phaseActivityLines(en, -150).free).toBe(en.free);
  });
});
