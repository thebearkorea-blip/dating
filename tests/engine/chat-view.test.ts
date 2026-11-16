import { and, eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { loadChatMeta, loadMessages, type MessageDto } from "../../src/engine/chat-view.js";
import { handleUserMessage } from "../../src/engine/chat.js";
import { seenAtFor, typingWindowMs } from "../../src/engine/typing.js";
import { loadGuards } from "../../src/policy/rules.js";

const { messages, relationships, users } = schema;
const db = drizzle(new PGlite(), { schema });
const T0 = new Date("2026-12-01T03:00:00Z");
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);

let userId = "";
let relId = "";
let currentUser: { id: string } | null = null;

vi.mock("@/auth/index", () => ({ getCurrentUser: async () => currentUser }));
vi.mock("@/db/client", () => ({ getDb: () => db }));
vi.mock("@/clock", () => ({ now: () => new Date("2026-12-01T03:00:00Z") }));

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function seed(rows: { id: string; sender: string; text: string; t: Date; media?: string }[]) {
  await db.insert(messages).values(rows.map((r) => ({ id: r.id, relId, at: r.t, deliverAt: r.t, sender: r.sender, text: r.text, mediaId: r.media ?? null })));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});

beforeEach(async () => {
  await db.delete(messages);
  const [u] = await db.insert(users).values({ displayName: "t" }).returning();
  userId = u!.id;
  currentUser = { id: userId };
  const [r] = await db.insert(relationships).values({ userId, characterId: "ihan", mode: "romance", startedAt: T0 }).returning();
  relId = r!.id;
});

const ids = (l: MessageDto[]) => l.map((m) => m.id);

describe("미도착 차단", () => {
  it("deliver_at = now+60s 행은 어떤 모드에도, 어떤 필드에도 나타나지 않는다", async () => {
    await seed([
      { id: uid(1), sender: "user", text: "hi", t: at(-120) },
      { id: uid(2), sender: "char", text: "SECRET-FUTURE-TEXT", t: at(60) },
    ]);
    for (const q of [
      { mode: "latest" as const },
      { mode: "after" as const, id: uid(1) },
      { mode: "before" as const, id: uid(1) },
      { mode: "around" as const, id: uid(1) },
    ]) {
      const p = await loadMessages(db, relId, q, T0);
      expect(JSON.stringify(p)).not.toContain("SECRET-FUTURE-TEXT");
      expect(ids(p?.messages ?? [])).not.toContain(uid(2));
    }
    // 미도착 행 id를 기준으로 삼는 것도 불가
    expect(await loadMessages(db, relId, { mode: "around", id: uid(2) }, T0)).toBeNull();
    expect(await loadMessages(db, relId, { mode: "before", id: uid(2) }, T0)).toBeNull();
    const meta = await loadChatMeta(db, { id: relId, stage: 1 }, T0);
    expect(JSON.stringify(meta)).not.toContain("SECRET-FUTURE-TEXT");
  });
});

describe("커서", () => {
  it("같은 deliver_at 행이 있어도 before 페이지에 중복·누락이 없다", async () => {
    const rows = Array.from({ length: 130 }, (_, i) => ({
      id: uid(i + 1),
      sender: i % 2 ? "char" : "user",
      text: `m${i}`,
      t: at(-1000 + Math.floor(i / 4)), // 4개씩 같은 시각
    }));
    await seed(rows);
    const collected: string[] = [];
    let page = await loadMessages(db, relId, { mode: "latest" }, T0);
    expect(page!.messages).toHaveLength(50);
    collected.unshift(...ids(page!.messages));
    while (page!.hasMoreBefore) {
      page = await loadMessages(db, relId, { mode: "before", id: page!.messages[0]!.id, limit: 50 }, T0);
      collected.unshift(...ids(page!.messages));
    }
    expect(collected).toHaveLength(130);
    expect(new Set(collected).size).toBe(130);
    // (deliver_at, id) 순서와 일치
    expect(collected).toEqual(rows.map((r) => r.id)); // 시각 오름차순, 같은 시각은 id 오름차순
  });

  it("after는 기준 뒤만, around는 앞뒤 25개", async () => {
    await seed(Array.from({ length: 80 }, (_, i) => ({ id: uid(i + 1), sender: "char", text: `m${i}`, t: at(-500 + i) })));
    const a = await loadMessages(db, relId, { mode: "after", id: uid(70) }, T0);
    expect(ids(a!.messages)).toEqual(Array.from({ length: 10 }, (_, i) => uid(71 + i)));
    const r = await loadMessages(db, relId, { mode: "around", id: uid(40) }, T0);
    expect(r!.messages).toHaveLength(51);
    expect(r!.messages[25]!.id).toBe(uid(40));
    expect(r!.hasMoreBefore).toBe(true);
  });

  it("DTO에는 origin·tag가 없다", async () => {
    await seed([{ id: uid(1), sender: "char", text: "x", t: at(-10) }]);
    const p = await loadMessages(db, relId, { mode: "latest" }, T0);
    expect(Object.keys(p!.messages[0]!).sort()).toEqual(["at", "id", "mediaId", "reactions", "replyTo", "sender", "text"]);
  });
});

describe("status·meta", () => {
  it("내 마지막 메시지: 뒤에 그의 메시지가 있으면 read, 없으면 delivered", async () => {
    await seed([{ id: uid(1), sender: "user", text: "a", t: at(-100) }]);
    let p = await loadMessages(db, relId, { mode: "latest" }, T0);
    expect(p!.messages[0]!.status).toBe("delivered");
    await seed([{ id: uid(2), sender: "char", text: "b", t: at(-50) }]);
    p = await loadMessages(db, relId, { mode: "latest" }, T0);
    expect(p!.messages[0]!.status).toBe("read");
    expect(p!.messages[1]!.status).toBeUndefined();
  });

  it("대기 행이 있으면 입력 중 시작 전엔 wakeAt=시작 시각, 시작 후엔 wakeAt=도착", async () => {
    await seed([{ id: uid(1), sender: "char", text: "hello", t: at(60) }]); // 5글자 → 창 4.2초
    const early = await loadChatMeta(db, { id: relId, stage: 1 }, T0);
    expect(early.typing).toBe(false);
    expect(early.wakeAt).toBe(at(60 - 4.2).toISOString());
    const inWindow = await loadChatMeta(db, { id: relId, stage: 1 }, at(57));
    expect(inWindow.typing).toBe(true);
    expect(inWindow.wakeAt).toBe(at(60).toISOString());
  });
});

describe("route", () => {
  it("남의 관계 id면 404, 본인이면 200", async () => {
    const { GET } = await import("../../src/app/api/chat/messages/route.js");
    await seed([{ id: uid(1), sender: "char", text: "x", t: at(-10) }]);
    const [other] = await db.insert(users).values({ displayName: "o" }).returning();
    const [otherRel] = await db.insert(relationships).values({ userId: other!.id, characterId: "ihan", mode: "romance", startedAt: T0 }).returning();
    const bad = await GET(new Request(`http://x/api/chat/messages?rel=${otherRel!.id}`));
    expect(bad.status).toBe(404);
    const ok = await GET(new Request(`http://x/api/chat/messages?rel=${relId}`));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(Object.keys(body).sort()).toEqual(["activity", "charReactions", "hasMoreBefore", "messages", "mine", "serverNow", "typing", "wakeAt"]);
    // 남의 메시지 id를 기준으로 삼아도 404
    await db.insert(messages).values({ id: uid(999), relId: otherRel!.id, at: at(-5), deliverAt: at(-5), sender: "char", text: "theirs" });
    expect((await GET(new Request(`http://x/api/chat/messages?around=${uid(999)}`))).status).toBe(404);
    expect((await GET(new Request(`http://x/api/chat/messages?before=${uid(999)}`))).status).toBe(404);
  });
});

describe("읽음 시각(seen_at)", () => {
  const seen = (id: string, s: Date | null) => db.update(messages).set({ seenAt: s }).where(eq(messages.id, id));

  it("seenAtFor는 보낸 시각과 입력 중 시작 사이이고 id로 고정된다", () => {
    for (let n = 1; n <= 30; n++) {
      const id = uid(n);
      const deliver = at(120);
      const s = seenAtFor(id, at(0), deliver, 40);
      expect(s.getTime()).toBeGreaterThanOrEqual(at(0).getTime());
      expect(s.getTime()).toBeLessThanOrEqual(deliver.getTime() - typingWindowMs(40));
      expect(seenAtFor(id, at(0), deliver, 40).getTime()).toBe(s.getTime());
      // 지연 0: 보낸 뒤 2초 안
      expect(seenAtFor(id, at(0), at(0), 40).getTime()).toBeLessThanOrEqual(at(0).getTime() + 2000);
    }
  });

  it("미래 seen_at은 Delivered이고 어떤 응답에도 값이 실리지 않는다", async () => {
    await seed([{ id: uid(1), sender: "user", text: "hi", t: at(-2) }]);
    await seen(uid(1), at(30));
    const p = await loadMessages(db, relId, { mode: "latest" }, T0);
    expect(p!.messages[0]!.status).toBe("delivered");
    expect(p!.messages[0]!.readAt).toBeUndefined();
    const { GET } = await import("../../src/app/api/chat/messages/route.js");
    const body = JSON.stringify(await (await GET(new Request(`http://x/api/chat/messages?rel=${relId}`))).json());
    // 값은 wakeAt(다음 상태 변화 시각)으로만 나가고 readAt·seen 필드는 없다.
    const json = JSON.parse(body);
    expect(json.wakeAt).toBe(at(30).toISOString());
    expect(json.mine).toEqual({ id: uid(1), status: "delivered", readAt: null });
    expect(body).not.toContain("readAt\":\"");
    expect(body).not.toContain("seen");
  });

  it("Delivered→Read 전환 시각이 wakeAt에 나오고, 그 시각 이후엔 Read + readAt", async () => {
    await seed([{ id: uid(1), sender: "user", text: "hi", t: at(-2) }]);
    await seen(uid(1), at(0.5));
    const before = await loadChatMeta(db, { id: relId, stage: 1 }, T0);
    expect(before.wakeAt).toBe(at(0.5).toISOString());
    expect(before.mine).toEqual({ id: uid(1), status: "delivered", readAt: null });
    const after = await loadChatMeta(db, { id: relId, stage: 1 }, at(1));
    expect(after.mine).toEqual({ id: uid(1), status: "read", readAt: at(0.5).toISOString() });
    const p = await loadMessages(db, relId, { mode: "latest" }, at(1));
    expect(p!.messages[0]).toMatchObject({ status: "read", readAt: at(0.5).toISOString() });
  });

  it("seen_at 없는 옛 행은 그의 다음 메시지가 있으면 Read(파생)", async () => {
    await seed([
      { id: uid(1), sender: "user", text: "hi", t: at(-5) },
      { id: uid(2), sender: "char", text: "yo", t: at(-3) },
    ]);
    const p = await loadMessages(db, relId, { mode: "latest" }, T0);
    expect(p!.messages[0]!.status).toBe("read");
  });
});

describe("답장 예약 시 seen_at 기록", () => {
  const rules = loadGuards("content/policy/guards.yaml");
  const llm = async (req: { model: string }) => ({ text: "Hey, good to hear from you.", model: req.model });
  const send = (text: string, now: Date) => handleUserMessage({ db, llm: llm as never, rules, memoryMode: "rules", now }, userId, text);
  const userRows = () => db.select().from(messages).where(and(eq(messages.relId, relId), eq(messages.sender, "user"))).orderBy(messages.at);

  it("답장 deliverAt 기준 보낸 시각~입력 중 시작 사이에 기록된다", async () => {
    await send("hello", T0);
    const [u] = await userRows();
    const [r] = await db.select().from(messages).where(and(eq(messages.relId, relId), eq(messages.sender, "char")));
    expect(u!.seenAt).not.toBeNull();
    expect(u!.seenAt!.getTime()).toBeGreaterThanOrEqual(u!.at.getTime());
    const typingStart = r!.deliverAt.getTime() > u!.at.getTime() + 3000 ? r!.deliverAt.getTime() - typingWindowMs(r!.text.length) : u!.at.getTime() + 2000;
    expect(u!.seenAt!.getTime()).toBeLessThanOrEqual(Math.max(typingStart, u!.at.getTime() + 2000));
  });

  it("F7 재생성: 이미 지난 seen_at은 옮기지 않는다", async () => {
    await send("one", T0);
    const [u1] = await userRows();
    const past = u1!.seenAt!;
    // 그가 아직 답장을 보내기 전(대기 중)에 두 번째 메시지가 와서 답장이 재생성된다.
    const later = new Date(past.getTime() + 60_000);
    await send("two", later);
    const rows = await userRows();
    expect(rows[0]!.seenAt!.getTime()).toBe(past.getTime());
    expect(rows[1]!.seenAt).not.toBeNull();
  });
});
