import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { validateContentDir } from "../../src/content/load.js";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { loadCharacter } from "../../src/engine/chat.js";
import { characterName, getStrings } from "../../src/product/index.js";

describe("캐릭터별 world 파일", () => {
  const db = drizzle(new PGlite(), { schema });
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    await loadContent(db, "content");
  });
  afterEach(() => {
    delete process.env.PRODUCT;
  });

  it("us는 timeline.yaml, jp는 timeline-yeonhu.yaml을 읽는다", async () => {
    const us = await loadCharacter(db);
    expect(us.engine.timeline.beats.some((b) => b.id.startsWith("yeonhu_"))).toBe(false);
    process.env.PRODUCT = "jp";
    const jp = await loadCharacter(db);
    expect(jp.engine.id).toBe("yeonhu");
    expect(jp.engine.timeline.beats.some((b) => b.id.startsWith("yeonhu_"))).toBe(true);
    expect(jp.group?.id).toBe("nakdal");
    expect(jp.engine.schedule.phases).toHaveLength(3);
  });

  it("validate-content가 group-*.yaml·timeline-*.yaml도 검사한다", () => {
    const r = validateContentDir(join(import.meta.dirname, "../../content"));
    expect(r.issues).toEqual([]);
    for (const f of ["world/group-yeonhu.yaml", "world/group-halftone.yaml", "world/timeline-yeonhu.yaml", "world/group.yaml", "world/timeline.yaml"]) expect(r.checked).toContain(f);
  });
});

describe("표시 이름·제품 문구", () => {
  it("jp는 チュ・ヨヌ, us는 DB 이름 그대로(이전 표시 유지)", () => {
    expect(characterName("주연후", "jp")).toBe("チュ・ヨヌ");
    expect(characterName("서이한", "us")).toBe("서이한");
    expect(characterName(undefined, "us")).toBe("Ihan");
  });
  it("jp 배우 문구: 방영 카운트다운·所属, en은 그대로", () => {
    const ja = getStrings("jp");
    expect(ja["him.debutIn"]).toContain("放送開始");
    expect(ja["him.group"]).toBe("所属");
    expect(JSON.stringify(ja)).not.toMatch(/デビュー|グループ/);
    expect(getStrings("us")["him.debutIn"]).toBe("Debut in {days} days");
    expect(getStrings("us")["him.group"]).toBe("Group");
  });
});
