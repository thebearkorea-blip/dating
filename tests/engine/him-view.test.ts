import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { loadSentPhotos } from "../../src/engine/him-view.js";

const { messages, relationships, users } = schema;
const db = drizzle(new PGlite(), { schema });
const T0 = new Date("2026-12-01T03:00:00Z");
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let relA = "";
let relB = "";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});

beforeEach(async () => {
  await db.delete(messages);
  await db.delete(relationships);
  const [a] = await db.insert(users).values({ displayName: "a" }).returning();
  const [b] = await db.insert(users).values({ displayName: "b" }).returning();
  const [ra] = await db.insert(relationships).values({ userId: a!.id, characterId: "ihan", mode: "romance", startedAt: T0 }).returning();
  const [rb] = await db.insert(relationships).values({ userId: b!.id, characterId: "ihan", mode: "romance", startedAt: T0 }).returning();
  relA = ra!.id;
  relB = rb!.id;
});

describe("loadSentPhotos", () => {
  it("도착한 그의 사진만, 내 관계 것만 돌려준다", async () => {
    const row = (n: number, rel: string, sender: string, media: string | null, t: Date) => ({ id: uid(n), relId: rel, at: t, deliverAt: t, sender, text: media ? "" : "hi", mediaId: media });
    await db.insert(messages).values([
      row(1, relA, "char", "11111111-1111-4111-8111-111111111111", at(-60)),
      row(2, relA, "char", "22222222-2222-4222-8222-222222222222", at(60)), // 미도착
      row(3, relA, "user", "33333333-3333-4333-8333-333333333333", at(-30)), // 내가 보낸 사진
      row(4, relA, "char", null, at(-20)), // 텍스트
      row(5, relB, "char", "44444444-4444-4444-8444-444444444444", at(-10)), // 남의 관계
    ]);
    const got = await loadSentPhotos(db, relA, T0);
    expect(got.map((p) => p.mediaId)).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(JSON.stringify(got)).not.toContain("2222");
  });
});
