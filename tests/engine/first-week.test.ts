import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { fillScene, firstOpenScene, pendingUserDayScene, userDayOf, userDayScenes } from "../../src/engine/first-week.js";
import { handleUserMessage } from "../../src/engine/chat.js";
import { runProactiveTick } from "../../src/jobs/proactive.js";
import type { LlmRequest, LlmResponse } from "../../src/llm/index.js";

const { events, memories, messages, relationships, users } = schema;

describe("userDayOf", () => {
  it("관계 시작일이 1일째, 사용자 시간대 날짜 기준", () => {
    const start = new Date("2026-11-30T14:30:00Z"); // 서울 11-30 23:30, 로스앤젤레스 11-30 06:30
    expect(userDayOf(start, new Date("2026-11-30T15:30:00Z"), "Asia/Seoul")).toBe(2); // 서울 12-01 00:30
    expect(userDayOf(start, new Date("2026-11-30T15:30:00Z"), "America/Los_Angeles")).toBe(1);
    expect(userDayOf(start, start, "Asia/Seoul")).toBe(1);
  });
});

describe("scene 로더", () => {
  it("yeonhu: 2~7일째 장면이 하나씩(꼬리 포함 trigger)", () => {
    for (let d = 2; d <= 7; d++) expect(userDayScenes("yeonhu", d)).toHaveLength(1);
    expect(userDayScenes("yeonhu", 2)[0]!.trigger).toBe("user_day_2_proactive");
    expect(userDayScenes("yeonhu", 20)).toHaveLength(0);
  });
  it("ihan은 user_day 장면이 아직 없다", () => {
    for (let d = 1; d <= 10; d++) expect(userDayScenes("ihan", d)).toHaveLength(0);
  });
  it("first_open: 직접/링크 선택, 링크 대본이 없으면 틱톡 링크 → direct", () => {
    expect(firstOpenScene("yeonhu", false)?.trigger).toBe("first_open_direct");
    expect(firstOpenScene("yeonhu", true)?.trigger).toBe("first_open_via_link");
    expect(firstOpenScene("ihan", false)?.trigger).toBe("first_open_direct");
    expect(firstOpenScene("ihan", true)?.trigger).toBe("first_open_via_tiktok_link");
  });
  it("fillScene: 값 있으면 채우고, 없는 키가 남은 줄·빈 말풍선은 버린다", () => {
    expect(fillScene(["{{user_name}}さんへ\n一つ。{{memory_1}}\n二つ。{{memory_2}}", "{{seed_memory}}", "{{photo}} 写真"], { user_name: "A", memory_1: "X" })).toEqual(["Aさんへ\n一つ。X", "{{photo}} 写真"]);
  });
});

describe("user_day 장면 소비(DB)", () => {
  const db = drizzle(new PGlite(), { schema });
  const START = new Date("2026-11-30T00:00:00Z"); // 서울 11-30 09:00
  const DAY2 = new Date("2026-12-01T03:00:00Z"); // 서울 12-01(화) 12:00 점심
  let relId = "";
  let userId = "";
  const prev = process.env.PRODUCT;
  beforeAll(async () => {
    process.env.PRODUCT = "jp";
    await migrate(db, { migrationsFolder: "drizzle" });
    await loadContent(db, "content");
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.PRODUCT;
    else process.env.PRODUCT = prev;
  });
  beforeEach(async () => {
    await db.delete(events);
    await db.delete(messages);
    await db.delete(memories);
    await db.delete(relationships);
    await db.delete(users);
    const [u] = await db.insert(users).values({ displayName: "ミナ", tz: "Asia/Seoul" }).returning();
    userId = u!.id;
    const [r] = await db.insert(relationships).values({ userId, characterId: "yeonhu", mode: "romance", stage: 1, startedAt: START }).returning();
    relId = r!.id;
  });
  const rel = () => ({ id: relId, userId, stage: 1, startedAt: START });

  it("1일째는 없고 2일째에 user_day_2 장면, 태그를 남기면 다시 나오지 않는다", async () => {
    expect(await pendingUserDayScene(db, rel(), "yeonhu", START)).toBeNull();
    const p = await pendingUserDayScene(db, rel(), "yeonhu", DAY2);
    expect(p?.scene.id).toBe("day-02-proactive");
    expect(p?.tag).toBe("scene:day-02-proactive");
    await db.insert(messages).values({ relId, at: DAY2, deliverAt: DAY2, sender: "char", text: "x", origin: "reply", tag: p!.tag });
    expect(await pendingUserDayScene(db, rel(), "yeonhu", DAY2)).toBeNull();
  });
  it("7일째 편지: 이름·기억 3개를 채운다", async () => {
    for (const f of ["麦茶が好き", "猫を飼っている", "朝が弱い"]) await db.insert(memories).values({ relId, fact: f });
    const p = await pendingUserDayScene(db, rel(), "yeonhu", new Date("2026-12-06T03:00:00Z"));
    expect(p?.scene.id).toBe("day-07-first-letter");
    const text = p!.bubbles.join("\n");
    expect(text).toContain("ミナさんへ");
    expect(text).toContain("麦茶が好き");
    expect(text).not.toContain("{{");
  });
  it("첫 답장: 2일째 장면이 시스템 지시에 들어가고 답장에 태그가 붙는다(한 번만)", async () => {
    const calls: LlmRequest[] = [];
    const llm = async (req: LlmRequest): Promise<LlmResponse> => {
      calls.push(req);
      return { text: "そうなんですね。", model: req.model };
    };
    const deps = { db, now: DAY2, llm, memoryMode: "rules" as const };
    await handleUserMessage(deps, userId, "こんにちは");
    const system = String(calls.find((c) => c.messages[0]?.role === "system")?.messages[0]?.content);
    expect(system).toContain("planned to bring this up today");
    expect(system).toContain("台本が届きました");
    const tagged = await db.select().from(messages).where(eq(messages.tag, "scene:day-02-proactive"));
    expect(tagged).toHaveLength(1);
    expect(tagged[0]!.sender).toBe("char");
    calls.length = 0;
    await handleUserMessage({ ...deps, now: new Date(DAY2.getTime() + 60_000) }, userId, "元気です");
    expect(String(calls.find((c) => c.messages[0]?.role === "system")?.messages[0]?.content)).not.toContain("planned to bring this up today");
  });
  it("선톡 틱: 2일째 후보 시각에 장면 대본이 그대로 나가고 두 번째 틱엔 나가지 않는다", async () => {
    const llm = vi.fn(async (req: LlmRequest): Promise<LlmResponse> => ({ text: "こんにちは。", model: req.model }));
    const push = vi.fn(async () => 1);
    await runProactiveTick({ db, now: DAY2, llm, push });
    const rows = await db.select().from(messages).where(and(eq(messages.relId, relId), eq(messages.tag, "scene:day-02-proactive")));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.text).toContain("台本");
    const n = rows.length;
    await runProactiveTick({ db, now: new Date(DAY2.getTime() + 3600_000 * 2), llm, push });
    const again = await db.select().from(messages).where(eq(messages.tag, "scene:day-02-proactive"));
    expect(again).toHaveLength(n);
  });
});
