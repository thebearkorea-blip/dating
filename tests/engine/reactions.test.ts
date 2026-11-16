import { and, eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { handleUserMessage, recordUserMessage } from "../../src/engine/chat.js";
import { loadChatMeta, loadMessages } from "../../src/engine/chat-view.js";
import { reactionField, ruleReaction } from "../../src/engine/judge.js";
import { USER_REACTIONS } from "../../src/engine/reaction-emoji.js";
import { decideCharReaction, maybeRecordCharReaction, replyContextLines, rollsCharReaction, setUserReaction } from "../../src/engine/reactions.js";
import type { LlmRequest, LlmResponse } from "../../src/llm/index.js";
import { loadGuards } from "../../src/policy/rules.js";

const { media, messages, reactions, relationships, users } = schema;
const db = drizzle(new PGlite(), { schema });
const rules = loadGuards("content/policy/guards.yaml");
const T0 = new Date("2026-12-01T03:00:00Z");
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let userId = "";
let relId = "";
let currentUser: { id: string } | null = null;

vi.mock("@/auth/index", () => ({ getCurrentUser: async () => currentUser }));
vi.mock("@/db/client", () => ({ getDb: () => db }));
vi.mock("@/clock", () => ({ now: () => new Date("2026-12-01T03:00:00Z") }));

async function seed(rows: { id: string; sender: string; text: string; t: Date; media?: string; rel?: string; replyTo?: string }[]) {
  await db.insert(messages).values(
    rows.map((r) => ({ id: r.id, relId: r.rel ?? relId, at: r.t, deliverAt: r.t, sender: r.sender, text: r.text, mediaId: r.media ?? null, replyTo: r.replyTo ?? null })),
  );
}

async function otherRelationship(): Promise<{ userId: string; relId: string }> {
  const [o] = await db.insert(users).values({ displayName: "o" }).returning();
  const [r] = await db.insert(relationships).values({ userId: o!.id, characterId: "ihan", mode: "romance", startedAt: T0 }).returning();
  return { userId: o!.id, relId: r!.id };
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});

beforeEach(async () => {
  await db.delete(reactions);
  await db.delete(messages);
  const [u] = await db.insert(users).values({ displayName: "t" }).returning();
  userId = u!.id;
  currentUser = { id: userId };
  const [r] = await db.insert(relationships).values({ userId, characterId: "ihan", mode: "romance", startedAt: T0 }).returning();
  relId = r!.id;
});

describe("setUserReaction (W9)", () => {
  it("추가·변경·취소가 저장되고 DTO에 반영된다", async () => {
    await seed([{ id: uid(1), sender: "char", text: "hey", t: at(-10) }]);
    expect(await setUserReaction(db, userId, uid(1), "❤️", T0)).toBe("ok");
    expect(await setUserReaction(db, userId, uid(1), "😂", T0)).toBe("ok");
    let p = await loadMessages(db, relId, { mode: "latest" }, T0);
    expect(p!.messages[0]!.reactions).toEqual({ user: "😂" });
    expect(await db.select().from(reactions)).toHaveLength(1);
    expect(await setUserReaction(db, userId, uid(1), null, T0)).toBe("ok");
    p = await loadMessages(db, relId, { mode: "latest" }, T0);
    expect(p!.messages[0]!.reactions).toEqual({});
  });

  it("남의 메시지·미도착·내가 보낸 메시지·허용 목록 밖 emoji는 거부", async () => {
    const other = await otherRelationship();
    await seed([
      { id: uid(1), sender: "char", text: "theirs", t: at(-10), rel: other.relId },
      { id: uid(2), sender: "char", text: "future", t: at(60) },
      { id: uid(3), sender: "user", text: "mine", t: at(-5) },
      { id: uid(4), sender: "char", text: "ok", t: at(-3) },
    ]);
    expect(await setUserReaction(db, userId, uid(1), "❤️", T0)).toBe("not_found");
    expect(await setUserReaction(db, userId, uid(2), "❤️", T0)).toBe("not_found");
    expect(await setUserReaction(db, userId, uid(3), "❤️", T0)).toBe("not_found");
    expect(await setUserReaction(db, userId, uid(4), "🔥", T0)).toBe("invalid");
    expect(await setUserReaction(db, userId, uid(4), "👀", T0)).toBe("invalid");
    expect(await setUserReaction(db, userId, "not-a-uuid", "❤️", T0)).toBe("not_found");
    expect(await db.select().from(reactions)).toHaveLength(0);
  });

  it("서버 액션 setReaction도 남의 메시지면 ok:false", async () => {
    const { setReaction } = await import("../../src/app/chat/actions.js");
    const other = await otherRelationship();
    await seed([
      { id: uid(1), sender: "char", text: "theirs", t: at(-10), rel: other.relId },
      { id: uid(2), sender: "char", text: "mine", t: at(-10) },
    ]);
    expect(await setReaction(uid(1), "❤️")).toEqual({ ok: false });
    expect(await setReaction(uid(2), "❤️")).toEqual({ ok: true });
    expect(await setReaction(uid(2), "💩")).toEqual({ ok: false });
  });
});

describe("인용 답장 저장 (W10)", () => {
  it("같은 관계의 도착한 메시지만 reply_to로 저장, 다른 관계·미도착은 거부", async () => {
    const other = await otherRelationship();
    await seed([
      { id: uid(1), sender: "char", text: "theirs", t: at(-10), rel: other.relId },
      { id: uid(2), sender: "char", text: "future", t: at(60) },
      { id: uid(3), sender: "char", text: "mine", t: at(-10) },
    ]);
    await expect(recordUserMessage({ db, now: T0 }, userId, "hi", uid(11), uid(1))).rejects.toThrow();
    await expect(recordUserMessage({ db, now: T0 }, userId, "hi", uid(12), uid(2))).rejects.toThrow();
    const ok = await recordUserMessage({ db, now: T0 }, userId, "hi", uid(13), uid(3));
    expect(ok.status).toBe("ok");
    const [row] = await db.select().from(messages).where(eq(messages.id, uid(13)));
    expect(row!.replyTo).toBe(uid(3));
    expect(await db.select().from(messages).where(eq(messages.id, uid(11)))).toHaveLength(0);
    const p = await loadMessages(db, relId, { mode: "latest" }, T0);
    expect(p!.messages.find((m) => m.id === uid(13))!.replyTo).toEqual({ id: uid(3), sender: "char", text: "mine", mediaId: null });
  });
});

describe("답장 생성 문맥 (W9·W10)", () => {
  it("반응 줄은 그의 마지막 답장 이후 반응만", async () => {
    await seed([
      { id: uid(1), sender: "char", text: "old line", t: at(-300) },
      { id: uid(2), sender: "char", text: "new line", t: at(-100) },
    ]);
    await setUserReaction(db, userId, uid(1), "😂", at(-200)); // 마지막 답장(-100) 전
    await setUserReaction(db, userId, uid(2), "❤️", at(-50)); // 후
    const lines = await replyContextLines(db, relId, T0, T0);
    expect(lines).toEqual(['she reacted ❤️ to: "new line"']);
  });

  it("인용은 원문 200자, 사진이면 media 메타데이터", async () => {
    const [ph] = await db.select().from(media).limit(1);
    const long = "x".repeat(300);
    await seed([
      { id: uid(1), sender: "char", text: long, t: at(-300) },
      { id: uid(2), sender: "char", text: "", t: at(-200), media: ph!.id },
      { id: uid(3), sender: "user", text: "lol", t: at(-50), replyTo: uid(1) },
      { id: uid(4), sender: "user", text: "cute!", t: at(-40), replyTo: uid(2) },
    ]);
    const lines = await replyContextLines(db, relId, at(-40), T0);
    expect(lines[0]).toBe(`she replied to "${"x".repeat(200)}…" with: "lol"`);
    const tags = ph!.tags as { situation: string; place: string };
    expect(lines[1]).toContain("your photo (");
    expect(lines[1]).toContain(tags.situation);
    expect(lines[1]).toContain(tags.place);
    expect(lines[1]).toContain('with: "cute!"');
  });

  it("다음 답장 생성 때 system 프롬프트에 반응 줄이 들어간다(반응만으로는 LLM 0회)", async () => {
    const calls: LlmRequest[] = [];
    const llm = async (req: LlmRequest): Promise<LlmResponse> => {
      calls.push(req);
      return { text: "Hey you.", model: req.model };
    };
    await seed([{ id: uid(1), sender: "char", text: "practice ran late", t: at(-100) }]);
    await setUserReaction(db, userId, uid(1), "🥺", at(-50));
    expect(calls).toHaveLength(0);
    await handleUserMessage({ db, llm, rules, memoryMode: "rules", now: T0 }, userId, "you ok?");
    const system = calls.find((c) => c.model && c.messages[0]?.role === "system" && c.messages[0].content.includes("Since your last reply"));
    expect(system?.messages[0]!.content).toContain('she reacted 🥺 to: "practice ran late"');
  });
});

describe("그의 반응 (W11)", () => {
  it("judge reaction 필드는 허용 목록만, 규칙 모드는 키워드", () => {
    expect(reactionField({ reaction: "😂" })).toBe("😂");
    expect(reactionField({ reaction: "🔥" })).toBeNull();
    expect(reactionField(null)).toBeNull();
    expect(ruleReaction("hahaha that's so funny")).toBe("😂");
    expect(ruleReaction("I'm so tired today")).toBe("🥺");
  });

  it("40개 메시지: 15~35%, 연속 0, 같은 이모지 3연속 0 (seed 고정)", async () => {
    const texts = ["miss you", "haha lol", "so tired", "omg wow", "good luck today!", "what are you doing", "ate ramen", "love you"];
    for (let i = 0; i < 40; i++) {
      const id = uid(100 + i);
      await db.insert(messages).values({ id, relId, at: at(i * 60), deliverAt: at(i * 60), sender: "user", text: texts[i % texts.length]!, seenAt: at(i * 60 + 5) });
      await maybeRecordCharReaction(db, { userId, relId, userMsgId: id, judged: ruleReaction(texts[i % texts.length]!), busy: 0, delayMs: 0 });
    }
    const rows = await db.select({ msgId: reactions.msgId, emoji: reactions.emoji, at: reactions.at }).from(reactions).where(eq(reactions.by, "char"));
    const rate = rows.length / 40;
    expect(rate).toBeGreaterThanOrEqual(0.15);
    expect(rate).toBeLessThanOrEqual(0.35);
    const idx = rows.map((r) => Number(r.msgId.slice(-12)) - 100).sort((a, b) => a - b);
    for (let k = 1; k < idx.length; k++) expect(idx[k]! - idx[k - 1]!).toBeGreaterThan(1);
    const seq = [...rows].sort((a, b) => a.at.getTime() - b.at.getTime()).map((r) => r.emoji);
    for (let k = 2; k < seq.length; k++) expect(seq[k] === seq[k - 1] && seq[k] === seq[k - 2]).toBe(false);
    // at = seen_at
    for (const r of rows) {
      const [m] = await db.select({ seenAt: messages.seenAt }).from(messages).where(eq(messages.id, r.msgId));
      expect(r.at.getTime()).toBe(m!.seenAt!.getTime());
    }
  });

  it("같은 후보만 계속 와도 3연속은 없다(순수 판정)", () => {
    const got: string[] = [];
    let prev = false;
    for (let i = 0; i < 200; i++) {
      const e = decideCharReaction({ userMsgId: uid(1000 + i), candidate: "❤️", prevHasReaction: prev, lastTwo: got.slice(-2).reverse() });
      prev = !!e;
      if (e) got.push(e);
    }
    expect(got.length).toBeGreaterThan(0);
    for (let k = 2; k < got.length; k++) expect(got[k] === got[k - 1] && got[k] === got[k - 2]).toBe(false);
  });

  it("바쁘고 10분 넘게 늦으면 👀", async () => {
    let n = 1;
    while (!rollsCharReaction(uid(n))) n++;
    await db.insert(messages).values({ id: uid(n), relId, at: at(-10), deliverAt: at(-10), sender: "user", text: "hi", seenAt: at(30) });
    expect(await maybeRecordCharReaction(db, { userId, relId, userMsgId: uid(n), judged: "❤️", busy: 2, delayMs: 11 * 60000 })).toBe("👀");
  });

  it("미래 반응은 목록·meta·API·페이지 어디에도 없다", async () => {
    await seed([{ id: uid(1), sender: "user", text: "hi", t: at(-10) }]);
    await db.insert(reactions).values({ msgId: uid(1), userId, by: "char", emoji: "😮", at: at(30) });
    const p = await loadMessages(db, relId, { mode: "latest" }, T0);
    expect(p!.messages[0]!.reactions).toEqual({});
    const meta = await loadChatMeta(db, { id: relId, stage: 1 }, T0);
    expect(meta.charReactions).toEqual([]);
    const { GET } = await import("../../src/app/api/chat/messages/route.js");
    const body = await (await GET(new Request("http://x/api/chat/messages"))).text();
    expect(body).not.toContain("😮");
    // 시각이 지나면 보인다
    const later = await loadMessages(db, relId, { mode: "latest" }, at(31));
    expect(later!.messages[0]!.reactions).toEqual({ char: "😮" });
    expect((await loadChatMeta(db, { id: relId, stage: 1 }, at(31))).charReactions).toEqual([{ id: uid(1), emoji: "😮" }]);
  });

  it("handleUserMessage(규칙 모드)가 반응을 달면 at = seen_at", async () => {
    const llm = async (req: LlmRequest): Promise<LlmResponse> => ({ text: "Hey.", model: req.model });
    for (let i = 0; i < 8; i++) await handleUserMessage({ db, llm, rules, memoryMode: "rules", now: at(i * 600) }, userId, `haha lol ${i}`);
    const rows = await db
      .select({ at: reactions.at, seenAt: messages.seenAt, emoji: reactions.emoji })
      .from(reactions)
      .innerJoin(messages, eq(messages.id, reactions.msgId))
      .where(and(eq(reactions.by, "char"), eq(messages.relId, relId)));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.at.getTime()).toBe(r.seenAt!.getTime());
      expect([...USER_REACTIONS, "👀"]).toContain(r.emoji);
    }
  });
});
