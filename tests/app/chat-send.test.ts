import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { recordUserMessage } from "../../src/engine/chat.js";

const { messages, relationships, users } = schema;
const db = drizzle(new PGlite(), { schema });
const T0 = new Date("2026-12-01T03:00:00Z");

let userId = "";
let currentUser: { id: string; isBeta: boolean; tz: string } | null = null;
const afterJobs: (() => Promise<void>)[] = [];
const replyCalls: string[] = [];

vi.mock("@/auth/index", () => ({ getCurrentUser: async () => currentUser }));
vi.mock("@/db/client", () => ({ getDb: () => db }));
vi.mock("@/clock", () => ({ now: () => new Date("2026-12-01T03:00:00Z") }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => void afterJobs.push(fn) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/engine/chat", async (orig) => {
  const real = await orig<typeof import("../../src/engine/chat.js")>();
  return { ...real, generateReplyFor: async (_d: unknown, _u: string, _r: string, msgId: string) => void replyCalls.push(msgId) };
});

const ID1 = "11111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});

beforeEach(async () => {
  afterJobs.length = 0;
  replyCalls.length = 0;
  await db.delete(messages);
  await db.delete(relationships);
  const [u] = await db.insert(users).values({ displayName: "t" }).returning();
  userId = u!.id;
  currentUser = { id: userId, isBeta: false, tz: "America/New_York" };
});

async function withRel() {
  await db.insert(relationships).values({ userId, characterId: "ihan", mode: "romance", startedAt: T0 });
}

describe("전송 id 멱등", () => {
  it("같은 id로 두 번 보내면 행 1개, 답장 생성 1회", async () => {
    await withRel();
    const { sendMessage } = await import("../../src/app/chat/actions.js");
    expect(await sendMessage("hello", ID1)).toEqual({ ok: true });
    expect(await sendMessage("hello", ID1)).toEqual({ ok: true });
    for (const j of afterJobs) await j();
    expect(await db.select().from(messages).where(eq(messages.id, ID1))).toHaveLength(1);
    expect(await db.select().from(messages)).toHaveLength(1);
    expect(replyCalls).toEqual([ID1]);
  });

  it("uuid가 아닌 id는 거부하고 저장하지 않는다", async () => {
    await withRel();
    const { sendMessage } = await import("../../src/app/chat/actions.js");
    expect(await sendMessage("hello", "not-a-uuid")).toEqual({ ok: false });
    expect(await db.select().from(messages)).toHaveLength(0);
    expect(afterJobs).toHaveLength(0);
    await expect(recordUserMessage({ db: db as never, now: T0 }, userId, "hello", "nope")).rejects.toThrow();
  });

  it("엔진: 중복 id는 duplicate 상태, 새 행 없음", async () => {
    await withRel();
    const first = await recordUserMessage({ db: db as never, now: T0 }, userId, "hi", ID1);
    expect(first.status).toBe("ok");
    expect(first.userMsgId).toBe(ID1);
    expect((await recordUserMessage({ db: db as never, now: T0 }, userId, "hi", ID1)).status).toBe("duplicate");
    expect(await db.select().from(messages)).toHaveLength(1);
  });
});

describe("채팅 페이지", () => {
  it("관계가 없으면 /onboarding으로 보낸다", async () => {
    const { default: Chat } = await import("../../src/app/chat/page.js");
    await expect(Chat({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/onboarding");
  });
});
