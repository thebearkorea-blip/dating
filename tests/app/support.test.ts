import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { supportInbox } from "../../src/admin/queries.js";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { recentUserMessageCount, reportReply, submitSupportRequest } from "../../src/engine/support.js";
import { SAFETY_SCRIPTS } from "../../src/policy/input-guard.js";

const { events, messages, relationships, users } = schema;
const db = drizzle(new PGlite(), { schema });
const T0 = new Date("2026-12-01T03:00:00Z");

let currentUser: { id: string; isBeta: boolean; tz: string } | null = null;
const afterJobs: (() => Promise<void>)[] = [];

vi.mock("@/auth/index", () => ({ getCurrentUser: async () => currentUser }));
vi.mock("@/db/client", () => ({ getDb: () => db }));
vi.mock("@/clock", () => ({ now: () => new Date("2026-12-01T03:00:00Z") }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => void afterJobs.push(fn) }));
vi.mock("@/engine/chat", async (orig) => {
  const real = await orig<typeof import("../../src/engine/chat.js")>();
  return { ...real, generateReplyFor: async () => {} };
});

async function seed(tag: string) {
  const [u] = await db.insert(users).values({ displayName: tag }).returning();
  const [r] = await db.insert(relationships).values({ userId: u!.id, characterId: "ihan", mode: "romance", startedAt: T0 }).returning();
  const [his] = await db.insert(messages).values({ relId: r!.id, sender: "char", text: `${tag}-his`, deliverAt: new Date(T0.getTime() - 60_000) }).returning();
  const [mine] = await db.insert(messages).values({ relId: r!.id, sender: "user", text: `${tag}-mine`, at: new Date(T0.getTime() - 120_000), deliverAt: new Date(T0.getTime() - 120_000) }).returning();
  const [future] = await db.insert(messages).values({ relId: r!.id, sender: "char", text: `${tag}-future`, deliverAt: new Date(T0.getTime() + 60_000) }).returning();
  return { userId: u!.id, relId: r!.id, his: his!.id, mine: mine!.id, future: future!.id };
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});

beforeEach(async () => {
  afterJobs.length = 0;
  await db.delete(events);
  await db.delete(messages);
  await db.delete(relationships);
});

describe("답장 신고", () => {
  it("내 관계의 도착한 그의 메시지만 기록한다", async () => {
    const a = await seed("alice");
    expect(await reportReply(db as never, a.userId, a.his, "hurtful", T0)).toBe("ok");
    const [ev] = await db.select().from(events).where(eq(events.kind, "reply_reported"));
    expect(ev!.meta).toEqual({ msgId: a.his, reason: "hurtful" });
    expect(ev!.userId).toBe(a.userId);
  });

  it("남의 메시지·내 메시지·미도착·없는 id·잘못된 사유는 거부하고 기록하지 않는다", async () => {
    const a = await seed("alice");
    const b = await seed("bob");
    expect(await reportReply(db as never, a.userId, b.his, "hurtful", T0)).toBe("not_found");
    expect(await reportReply(db as never, a.userId, a.mine, "hurtful", T0)).toBe("not_found");
    expect(await reportReply(db as never, a.userId, a.future, "hurtful", T0)).toBe("not_found");
    expect(await reportReply(db as never, a.userId, "11111111-1111-4111-8111-111111111111", "hurtful", T0)).toBe("not_found");
    expect(await reportReply(db as never, a.userId, "nope", "hurtful", T0)).toBe("invalid");
    expect(await reportReply(db as never, a.userId, a.his, "spam", T0)).toBe("invalid");
    expect(await db.select().from(events)).toHaveLength(0);
  });

  it("서버 액션: 비로그인은 거부, 남의 메시지는 기록하지 않는다", async () => {
    const a = await seed("alice");
    const b = await seed("bob");
    const { reportMessage } = await import("../../src/app/chat/actions.js");
    currentUser = null;
    expect(await reportMessage(a.his, "other")).toEqual({ ok: false });
    currentUser = { id: a.userId, isBeta: false, tz: "America/New_York" };
    expect(await reportMessage(b.his, "other")).toEqual({ ok: false });
    expect(await reportMessage(a.his, "other")).toEqual({ ok: true });
    expect(await db.select().from(events)).toHaveLength(1);
  });
});

describe("문의", () => {
  it("분류·길이를 검사하고 기록한다", async () => {
    const a = await seed("alice");
    expect(await submitSupportRequest(db as never, a.userId, "billing", "  help  ")).toBe("ok");
    expect(await submitSupportRequest(db as never, a.userId, "nope", "x")).toBe("invalid");
    expect(await submitSupportRequest(db as never, a.userId, "bug", "   ")).toBe("invalid");
    expect(await submitSupportRequest(db as never, a.userId, "bug", "x".repeat(2001))).toBe("invalid");
    const rows = await db.select().from(events).where(eq(events.kind, "support_request"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.meta).toEqual({ category: "billing", text: "help" });
  });

  it("admin 목록: 최신순, 신고에는 메시지 본문이 붙는다", async () => {
    const a = await seed("alice");
    await submitSupportRequest(db as never, a.userId, "other", "first", new Date(T0.getTime() - 5000));
    await reportReply(db as never, a.userId, a.his, "inappropriate", T0);
    const items = await supportInbox(db as never);
    expect(items.map((i) => i.kind)).toEqual(["reply_reported", "support_request"]);
    expect(items[0]!.msgText).toBe("alice-his");
    expect(items[1]!.text).toBe("first");
  });
});

describe("연타 제한", () => {
  it("60초에 10개를 보냈으면 11번째는 거절(limited), 저장하지 않는다. 다른 사용자는 영향 없음", async () => {
    const a = await seed("alice");
    const b = await seed("bob");
    currentUser = { id: a.userId, isBeta: false, tz: "America/New_York" };
    const { sendMessage } = await import("../../src/app/chat/actions.js");
    const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    for (let i = 1; i <= 10; i++) expect(await sendMessage(`m${i}`, uuid(i))).toEqual({ ok: true });
    expect(await recentUserMessageCount(db as never, a.userId, T0)).toBe(10);
    expect(await sendMessage("m11", uuid(11))).toEqual({ ok: false, limited: true });
    expect((await db.select().from(messages).where(eq(messages.id, uuid(11)))).length).toBe(0);
    currentUser = { id: b.userId, isBeta: false, tz: "America/New_York" };
    expect(await sendMessage("hi", uuid(99))).toEqual({ ok: true });
  });
});

describe("위기 대본(en)", () => {
  it("988과 911을 안내한다", () => {
    expect(SAFETY_SCRIPTS.en).toContain("988");
    expect(SAFETY_SCRIPTS.en).toContain("Suicide & Crisis Lifeline");
    expect(SAFETY_SCRIPTS.en).toContain("911");
  });
});
