import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { searchMessages } from "../../src/engine/chat-search.js";

const { messages, relationships, users } = schema;
const db = drizzle(new PGlite(), { schema });
const T0 = new Date("2026-12-01T03:00:00Z");
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let relId = "";
let otherRelId = "";

async function seed(rel: string, rows: { id: string; sender?: string; text: string; t?: Date }[]) {
  await db.insert(messages).values(rows.map((r) => ({ id: r.id, relId: rel, at: r.t ?? at(-10), deliverAt: r.t ?? at(-10), sender: r.sender ?? "char", text: r.text })));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});

beforeEach(async () => {
  await db.delete(messages);
  await db.delete(relationships);
  await db.delete(users);
  const [u] = await db.insert(users).values({ displayName: "a" }).returning();
  const [u2] = await db.insert(users).values({ displayName: "b" }).returning();
  const [r] = await db.insert(relationships).values({ userId: u!.id, characterId: "ihan", mode: "romance", startedAt: T0 }).returning();
  const [r2] = await db.insert(relationships).values({ userId: u2!.id, characterId: "ihan", mode: "romance", startedAt: T0 }).returning();
  relId = r!.id;
  otherRelId = r2!.id;
});

describe("대화 검색", () => {
  it("다른 사용자의 메시지는 나오지 않는다", async () => {
    await seed(relId, [{ id: uid(1), text: "pizza night" }]);
    await seed(otherRelId, [{ id: uid(2), text: "pizza secret" }]);
    const hits = await searchMessages(db, relId, "pizza", T0);
    expect(hits.map((h) => h.id)).toEqual([uid(1)]);
  });

  it("미도착(deliver_at = now+60s) 행은 나오지 않는다", async () => {
    await seed(relId, [
      { id: uid(1), text: "pizza now", t: at(-60) },
      { id: uid(2), text: "pizza FUTURE", t: at(60) },
    ]);
    const hits = await searchMessages(db, relId, "pizza", T0);
    expect(hits.map((h) => h.id)).toEqual([uid(1)]);
    expect(JSON.stringify(hits)).not.toContain("FUTURE");
  });

  it("% 와 _ 는 와일드카드가 아니라 글자로 일치한다", async () => {
    await seed(relId, [
      { id: uid(1), text: "100% sure", t: at(-30) },
      { id: uid(2), text: "100 percent", t: at(-20) },
      { id: uid(3), text: "a_b", t: at(-10) },
      { id: uid(4), text: "axb", t: at(-5) },
    ]);
    expect((await searchMessages(db, relId, "0% s", T0)).map((h) => h.id)).toEqual([uid(1)]);
    expect((await searchMessages(db, relId, "a_", T0)).map((h) => h.id)).toEqual([uid(3)]);
    expect(await searchMessages(db, relId, "%%", T0)).toEqual([]);
  });

  it("일본어·한국어 부분 문자열, 대소문자 무시, 최신순, 2자 미만 거부, 스니펫", async () => {
    await seed(relId, [
      { id: uid(1), sender: "user", text: "今日はラーメンを食べたよ", t: at(-300) },
      { id: uid(2), text: "오늘 라면 먹었어 Ramen!", t: at(-200) },
      { id: uid(3), text: "x".repeat(100) + "ラーメン" + "y".repeat(100), t: at(-100) },
    ]);
    expect((await searchMessages(db, relId, "ラーメン", T0)).map((h) => h.id)).toEqual([uid(3), uid(1)]);
    expect((await searchMessages(db, relId, "라면", T0)).map((h) => h.id)).toEqual([uid(2)]);
    expect((await searchMessages(db, relId, "RAMEN", T0)).map((h) => h.id)).toEqual([uid(2)]);
    expect(await searchMessages(db, relId, "ラ", T0)).toEqual([]);
    const [h] = await searchMessages(db, relId, "ラーメン", T0);
    expect(h!.snippet.length).toBeLessThanOrEqual(40 + 4 + 40 + 2);
    expect(h!.snippet).toContain("ラーメン");
    const hit1 = (await searchMessages(db, relId, "ラーメン", T0)).find((x) => x.id === uid(1));
    expect(hit1?.sender).toBe("user");
  });
});
