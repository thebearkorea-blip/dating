import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { BUSY_OVERLAY_LINES } from "../../src/engine/busy-overlay.js";
import { handleUserMessage, selectMemories } from "../../src/engine/chat.js";
import { extractMemories } from "../../src/jobs/memory-extract.js";
import { FALLBACK_LINES, guardOutput } from "../../src/policy/output-guard.js";
import { loadGuards } from "../../src/policy/rules.js";
import type { LlmRequest, LlmResponse } from "../../src/llm/index.js";

const { memories, messages, relationships, reviewFindings, users } = schema;
const db = drizzle(new PGlite(), { schema });
const rules = loadGuards("content/policy/guards.yaml");
const T0 = new Date("2026-12-01T03:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * 60000);

let calls: LlmRequest[] = [];
let replyText = "Hey, good to hear from you.";
const llm = vi.fn(async (req: LlmRequest): Promise<LlmResponse> => {
  calls.push(req);
  return { text: replyText, model: req.model };
});

let userId = "";
let relId = "";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});

beforeEach(async () => {
  calls = [];
  replyText = "Hey, good to hear from you.";
  delete process.env.DAILY_QUOTA_OVERRIDE;
  const [u] = await db.insert(users).values({ displayName: "t" }).returning();
  userId = u!.id;
  const [r] = await db
    .insert(relationships)
    .values({ userId, characterId: "ihan", mode: "romance", startedAt: T0 })
    .returning();
  relId = r!.id;
});

const send = (text: string, minutes = 0) =>
  handleUserMessage({ db, llm, rules, memoryMode: "rules", now: at(minutes) }, userId, text);
const chars = () =>
  db.select().from(messages).where(and(eq(messages.relId, relId), eq(messages.sender, "char")));

describe("한도", () => {
  it("5회째까지 LLM을 부르고 6회째는 0회 + 오버레이 문장", async () => {
    for (let i = 0; i < 5; i++) await send(`hello ${i}`, i);
    expect(llm).toHaveBeenCalledTimes(5);
    await send("hello again", 5);
    expect(llm).toHaveBeenCalledTimes(5);
    const rows = await chars();
    expect(rows).toHaveLength(6);
    expect(BUSY_OVERLAY_LINES as readonly string[]).toContain(rows.at(-1)!.text);
    expect(rows.every((r) => r.origin === "reply")).toBe(true);
  });

  it("DAILY_QUOTA_OVERRIDE가 기본값을 이긴다", async () => {
    process.env.DAILY_QUOTA_OVERRIDE = "1";
    llm.mockClear();
    await send("one", 0);
    await send("two", 1);
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it("KST 다음 날이면 리셋된다", async () => {
    llm.mockClear();
    for (let i = 0; i < 6; i++) await send(`m${i}`, i);
    expect(llm).toHaveBeenCalledTimes(5);
    await send("next day", 24 * 60);
    expect(llm).toHaveBeenCalledTimes(6);
  });

  it("오버레이 문장은 출력 가드를 통과한다", () => {
    for (const l of [...BUSY_OVERLAY_LINES, ...FALLBACK_LINES]) {
      expect(guardOutput(l, rules).findings).toEqual([]);
    }
  });
});

describe("가드", () => {
  it("입력 block이면 LLM 0회, 고정 안전 대본, 한도 미소비", async () => {
    llm.mockClear();
    await send("I want to kill myself", 0);
    expect(llm).not.toHaveBeenCalled();
    expect((await chars())).toHaveLength(1);
    const f = await db.select().from(reviewFindings).where(eq(reviewFindings.relId, relId));
    expect(f.some((x) => x.ruleId === "A9-crisis-input-regex")).toBe(true);
  });

  it("출력 block이면 재생성 1회 후 폴백 문장", async () => {
    replyText = "Why didn't you reply to me?";
    llm.mockClear();
    await send("hi", 0);
    expect(llm).toHaveBeenCalledTimes(2);
    const rows = await chars();
    expect(FALLBACK_LINES as readonly string[]).toContain(rows[0]!.text);
  });

  it("relationship_breakers는 로그만 남기고 관계는 유지된다", async () => {
    await send("I cheated on you with someone", 0);
    const f = await db.select().from(reviewFindings).where(eq(reviewFindings.relId, relId));
    expect(f.some((x) => x.ruleId === "breaker-B1")).toBe(true);
    const [rel] = await db.select({ endedAt: relationships.endedAt }).from(relationships).where(eq(relationships.id, relId));
    expect(rel!.endedAt).toBeNull();
  });
});

describe("전송 지연", () => {
  it("deliver_at은 replyDelayRange 안이고 결정적이다", async () => {
    await send("hi", 0);
    const [r] = await chars();
    const min = (r!.deliverAt.getTime() - T0.getTime()) / 60000;
    expect(min).toBeGreaterThanOrEqual(5);
    expect(min).toBeLessThanOrEqual(30 * 3);
  });
});

describe("기억", () => {
  it("사용자 메시지 20건 뒤 memories >= 1", async () => {
    for (let i = 0; i < 20; i++) await send(`I really like jazz number ${i}.`, i);
    const rows = await db.select().from(memories).where(eq(memories.relId, relId));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((m) => m.userVisible)).toBe(true);
  });

  it("마지막 메시지 후 30분이 지나면 이전 세션에서 추출한다", async () => {
    await send("My dog is named Momo.", 0);
    await send("hello", 45);
    const rows = await db.select().from(memories).where(eq(memories.relId, relId));
    expect(rows.map((m) => m.fact)).toContain("My dog is named Momo.");
  });

  it("삭제된 기억은 프롬프트에 주입되지 않고 되살아나지도 않는다", async () => {
    await db.insert(memories).values([
      { relId, fact: "I have a cat named Pepper" },
      { relId, fact: "I work at a bakery downtown" },
    ]);
    await db
      .update(memories)
      .set({ deletedAt: new Date() })
      .where(and(eq(memories.relId, relId), eq(memories.fact, "I have a cat named Pepper")));
    expect(await selectMemories(db, relId, "tell me about my cat Pepper")).toEqual(["I work at a bakery downtown"]);
    await send("hello there", 0);
    const sys = calls.at(-1)!.messages[0]!.content;
    expect(sys).toContain("bakery");
    expect(sys).not.toContain("Pepper");
    await db.insert(messages).values({ relId, sender: "user", text: "I have a cat named Pepper" });
    await extractMemories(db, relId, new Date(), { mode: "rules" });
    const live = await db.select().from(memories).where(and(eq(memories.relId, relId), isNull(memories.deletedAt)));
    expect(live.map((m) => m.fact)).not.toContain("I have a cat named Pepper");
  });

  it("단어 2개 이상 겹치는 오래된 기억만 추가로 주입된다", async () => {
    for (let i = 0; i < 12; i++) {
      await db.insert(memories).values({ relId, fact: `filler fact ${i}`, learnedAt: at(i) });
    }
    await db.insert(memories).values({ relId, fact: "I play guitar every sunday", learnedAt: at(-1000) });
    expect(await selectMemories(db, relId, "guitar sunday plans")).toContain("I play guitar every sunday");
    expect(await selectMemories(db, relId, "only guitar")).not.toContain("I play guitar every sunday");
  });
});

describe("affection 비노출", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  }
  it("chat·me 앱 코드에 affection 참조가 없고, 엔진은 숨김 컬럼을 읽지 않는다", () => {
    for (const f of [...files("src/app/chat"), ...files("src/app/me")]) {
      expect(readFileSync(f, "utf8").toLowerCase(), f).not.toContain("affection");
    }
    // 엔진에는 bible의 affection_stages(단계 표)만 있고 relationships.affection(숫자)은 없다.
    expect(readFileSync("src/engine/chat.ts", "utf8")).not.toMatch(/\.affection\b|affection:/);
  });
});
