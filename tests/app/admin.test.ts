import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isAdminUser } from "../../src/admin/guard.js";
import { computeFunnel, costSummary, eventCounts, funnel, ratingRows } from "../../src/admin/queries.js";
import { mockCancel, mockSubscribe } from "../../src/billing/mock.js";
import { takePaywall } from "../../src/billing/paywall.js";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { handleUserMessage } from "../../src/engine/chat.js";
import { EVENT_KINDS, maybeDay3Return, recordEvent } from "../../src/engine/events.js";
import { rateMessageCore } from "../../src/engine/ratings.js";
import { handleReconcile } from "../../src/engine/reconcile.js";
import type { LlmRequest, LlmResponse } from "../../src/llm/index.js";
import { CHAT_MODEL } from "../../src/llm/index.js";
import { completeTracked } from "../../src/llm/tracked.js";
import { loadGuards } from "../../src/policy/rules.js";

const { events, llmUsage, messages, ratings, relationships, users } = schema;
const db = drizzle(new PGlite(), { schema });
const rules = loadGuards("content/policy/guards.yaml");
const T0 = new Date("2026-12-01T03:00:00Z");
const DAY = 86400000;
const at = (min: number) => new Date(T0.getTime() + min * 60000);

const llm = vi.fn(async (req: LlmRequest): Promise<LlmResponse> => ({
  text: "Hey, good to hear from you.",
  model: req.model,
  usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0 },
}));

let userId = "";
let relId = "";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});

beforeEach(async () => {
  llm.mockClear();
  delete process.env.DAILY_QUOTA_OVERRIDE;
  const [u] = await db.insert(users).values({ displayName: "t", isBeta: true, createdAt: T0 }).returning();
  userId = u!.id;
  const [r] = await db.insert(relationships).values({ userId, characterId: "ihan", mode: "romance", startedAt: T0 }).returning();
  relId = r!.id;
});

const send = (text: string, now: Date) => handleUserMessage({ db, llm, rules, memoryMode: "rules", now }, userId, text);
const kinds = async () => (await db.select().from(events).where(eq(events.userId, userId))).map((e) => e.kind);

describe("rateMessage(core)", () => {
  it("베타만 저장하고, 비베타·사용자 메시지·남의 메시지·잘못된 점수는 저장하지 않는다", async () => {
    await send("hello there", at(0));
    const [him] = await db.select().from(messages).where(and(eq(messages.relId, relId), eq(messages.sender, "char")));
    const [mine] = await db.select().from(messages).where(and(eq(messages.relId, relId), eq(messages.sender, "user")));
    expect(await rateMessageCore(db, { id: userId, isBeta: false }, him!.id, -1, "x")).toBe("not_beta");
    expect(await rateMessageCore(db, { id: userId, isBeta: true }, mine!.id, 1, "")).toBe("invalid");
    expect(await rateMessageCore(db, { id: userId, isBeta: true }, him!.id, 5, "")).toBe("invalid");
    const [other] = await db.insert(users).values({ displayName: "o", isBeta: true }).returning();
    expect(await rateMessageCore(db, { id: other!.id, isBeta: true }, him!.id, 1, "")).toBe("invalid");
    expect(await db.select().from(ratings)).toHaveLength(0);

    expect(await rateMessageCore(db, { id: userId, isBeta: true }, him!.id, -1, " too stiff ")).toBe("ok");
    expect(await rateMessageCore(db, { id: userId, isBeta: true }, him!.id, 1, "")).toBe("ok"); // 덮어쓰기
    const rows = await db.select().from(ratings);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ score: 1, note: null });
    await rateMessageCore(db, { id: userId, isBeta: true }, him!.id, -1, " too stiff ");
    const r = await ratingRows(db);
    expect(r[0]).toMatchObject({ score: -1, note: "too stiff", prevUserText: "hello there" });
  });
});

describe("이벤트 11종", () => {
  it("각 흐름이 이벤트를 남긴다", async () => {
    // first_message
    await send("hello", at(0));
    await send("hello again", at(1));
    // quota_exhausted(하루 1회)
    process.env.DAILY_QUOTA_OVERRIDE = "0";
    await send("one", at(2));
    await send("two", at(3));
    delete process.env.DAILY_QUOTA_OVERRIDE;
    // paywall_shown
    expect(await takePaywall(db, userId, at(10), { PAYWALL_FORCE: "1" })).toBe(true);
    // subscribe / cancel
    await mockSubscribe(db, userId, at(20));
    await mockCancel(db, userId);
    // day3_return(가입 3일 전에는 없음, 이후 1회)
    expect(await maybeDay3Return(db, { id: userId, createdAt: T0 }, new Date(T0.getTime() + 2 * DAY))).toBe(false);
    expect(await maybeDay3Return(db, { id: userId, createdAt: T0 }, new Date(T0.getTime() + 3 * DAY))).toBe(true);
    expect(await maybeDay3Return(db, { id: userId, createdAt: T0 }, new Date(T0.getTime() + 4 * DAY))).toBe(false);
    // signup(온보딩 액션이 이 호출을 한다) / invite_link_open(가입 전: user null)
    await recordEvent(db, userId, "signup", { once: "ever" });
    await recordEvent(db, userId, "signup", { once: "ever" });
    await recordEvent(db, null, "invite_link_open", { meta: { t: 1 } });
    // breakup → reconcile
    await send("I cheated on you with someone.", at(60));
    await send("yes I did", at(65));
    const ended = new Date(at(65).getTime());
    expect(await handleReconcile({ db, now: new Date(ended.getTime() + 31 * DAY), memoryMode: "rules" }, userId, "I'm sorry for what I did. I should have told you the truth earlier, and I understand if it hurt.")).toBe("accepted");

    const got = await kinds();
    const count = (k: string) => got.filter((x) => x === k).length;
    for (const k of ["signup", "first_message", "day3_return", "quota_exhausted", "paywall_shown", "subscribe", "cancel", "breakup", "reconcile"]) {
      expect(count(k), k).toBe(1);
    }
    expect((await db.select().from(events).where(eq(events.kind, "invite_link_open"))).length).toBeGreaterThanOrEqual(1);
    expect(EVENT_KINDS).toHaveLength(11);
  });
});

describe("completeTracked", () => {
  it("usage·비용을 billing.llm_usage에 저장하고 응답은 그대로 돌려준다", async () => {
    const res = await completeTracked(db, "chat", { relId, userId, now: at(0) }, { model: CHAT_MODEL, messages: [{ role: "user", content: "hi" }] }, llm);
    expect(res.text).toBe("Hey, good to hear from you.");
    const [row] = await db.select().from(llmUsage).where(eq(llmUsage.relId, relId));
    expect(row).toMatchObject({ purpose: "chat", model: CHAT_MODEL, input: 1000, output: 200, cacheRead: 0, userId });
    expect(row!.costUsd).toBeCloseTo((1000 * 2 + 200 * 10) / 1e6, 10);
  });
  it("userId가 없으면 relId로 찾고, usage가 없으면 기록하지 않으며, 기록 실패는 삼킨다", async () => {
    await completeTracked(db, "judge", { relId }, { model: CHAT_MODEL, messages: [] }, llm);
    expect((await db.select().from(llmUsage).where(eq(llmUsage.relId, relId)))[0]!.userId).toBe(userId);
    const none = vi.fn(async (req: LlmRequest): Promise<LlmResponse> => ({ text: "x", model: req.model }));
    await completeTracked(db, "memory", { relId }, { model: CHAT_MODEL, messages: [] }, none);
    expect((await db.select().from(llmUsage).where(eq(llmUsage.purpose, "memory")))).toHaveLength(0);
    // 존재하지 않는 rel_id여도 응답은 정상(FK 없음 → user_id null로 저장)
    expect((await completeTracked(db, "chat", { relId: "00000000-0000-0000-0000-000000000000" }, { model: CHAT_MODEL, messages: [] }, llm)).text).toBe("Hey, good to hear from you.");
  });
  it("대화 한 턴이 chat 사용량을 남기고 costSummary가 합산한다", async () => {
    await send("hello", at(0));
    const s = await costSummary(db, new Date(T0.getTime() - DAY), new Date(T0.getTime() + DAY));
    const chat = s.byPurposeModel.find((r) => r.purpose === "chat")!;
    expect(chat.calls).toBeGreaterThanOrEqual(1);
    expect(s.total).toBeGreaterThan(0);
    expect(s.monthly.at(-1)!.perUser).not.toBeNull();
  });
});

describe("퍼널 계산", () => {
  it("단계별 숫자와 전환율(0 나눗셈은 null)", () => {
    const f = computeFunnel({ signup: 100, first_message: 80, day3_return: 40, subscribe: 5 });
    expect(f.map((s) => s.count)).toEqual([100, 80, 40, 5]);
    expect(f[1]).toMatchObject({ fromPrev: 0.8, fromSignup: 0.8 });
    expect(f[2]).toMatchObject({ fromPrev: 0.5, fromSignup: 0.4 });
    expect(f[3]).toMatchObject({ fromPrev: 0.125, fromSignup: 0.05 });
    expect(computeFunnel({}).every((s) => s.fromPrev === null && s.fromSignup === null)).toBe(true);
  });
  it("events 테이블의 고유 사용자 수로 센다", async () => {
    await recordEvent(db, userId, "signup");
    await recordEvent(db, userId, "signup");
    const c = await eventCounts(db);
    expect(c.signup).toBeGreaterThanOrEqual(1);
    const f = await funnel(db);
    expect(f.steps[0]!.count).toBe(c.signup);
  });
});

describe("admin 가드", () => {
  it("is_admin만 통과", () => {
    expect(isAdminUser({ isAdmin: true })).toBe(true);
    expect(isAdminUser({ isAdmin: false })).toBe(false);
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
  });
  it("모든 /admin 서버 컴포넌트(layout·page)가 requireAdmin을 부르고, requireAdmin은 notFound로 막는다", () => {
    for (const f of ["layout.tsx", "page.tsx"]) expect(readFileSync(join("src/app/admin", f), "utf8")).toMatch(/await requireAdmin\(\)/);
    const g = readFileSync("src/app/admin/require-admin.ts", "utf8");
    expect(g).toMatch(/isAdminUser\(user\)\) notFound\(\)/);
  });
});

describe("일반 사용자 화면 grep", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.(tsx?|ts)$/.test(n) ? [p] : [];
    });
  const user = ["src/app/chat", "src/app/me", "src/app/settings"].flatMap(files);

  it("평가 UI는 베타 가드 안에서만 렌더되고, 일반 화면은 admin·숫자(애정·단계·원가)를 싣지 않는다", () => {
    const page = readFileSync("src/app/chat/page.tsx", "utf8");
    expect(page.match(/<Rate\b/g)).toHaveLength(1);
    expect(page).toMatch(/user\.isBeta && m\.sender === "char" \? <Rate/);
    for (const f of user) {
      if (f.endsWith("Rate.tsx")) continue;
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/@\/admin|llmUsage|affection|\{rel\.stage\}|\{[^}]*\.stage\}/);
      if (!f.endsWith("chat/page.tsx") && !f.endsWith("chat/actions.ts")) expect(s, f).not.toMatch(/Rate|ratings/);
    }
  });
});
