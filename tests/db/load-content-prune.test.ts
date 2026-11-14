import { readFileSync, writeFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";

describe("loadContent media 정리", () => {
  const db = drizzle(new PGlite(), { schema });
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  it("매니페스트에 없는 media 행은 지우고 다른 캐릭터·기존 행은 그대로 둔다", async () => {
    await loadContent(db, "content");
    const count = async (c: string) => (await db.select().from(schema.media).where(eq(schema.media.characterId, c))).length;
    const ihan = await count("ihan");
    const isol = await count("isol");
    await db.insert(schema.media).values({ id: "ihan-zzz", characterId: "ihan", kind: "photo", tags: {}, audience: "all", face: false, blobUrl: "x" });
    expect(await count("ihan")).toBe(ihan + 1);
    await loadContent(db, "content");
    expect(await count("ihan")).toBe(ihan);
    expect(await count("isol")).toBe(isol);
    expect(await db.select().from(schema.media).where(eq(schema.media.id, "ihan-zzz"))).toHaveLength(0);
  });

  it("public_url이 있으면 media.blobUrl이 그 URL이다", async () => {
    const path = "content/characters/ihan/photos/manifest.jsonl";
    const orig = readFileSync(path, "utf8");
    const url = "https://abc.public.blob.vercel-storage.com/photos/ihan/ihan-p001-xyz.jpg";
    try {
      const lines = orig.split("\n");
      const idx = lines.findIndex((l) => l.trim() !== "" && JSON.parse(l).id === "ihan-p001");
      lines[idx] = JSON.stringify({ ...JSON.parse(lines[idx] ?? "{}"), public_url: url });
      writeFileSync(path, lines.join("\n"));
      await loadContent(db, "content");
      const [row] = await db.select().from(schema.media).where(eq(schema.media.id, "ihan-p001"));
      expect(row?.blobUrl).toBe(url);
    } finally {
      writeFileSync(path, orig);
    }
  });
});
