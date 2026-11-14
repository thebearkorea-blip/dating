import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { DAILY_CAP, decayFor, messageGain, stageOf } from "../../src/engine/affection.js";
import { handleUserMessage } from "../../src/engine/chat.js";
import { handleReconcile, reconcileStatus } from "../../src/engine/reconcile.js";
import { maybeFreezeProfile } from "../../src/engine/profile.js";
import { parseScene } from "../../src/engine/scenes.js";
import { advanceSulk, NATURAL_MS, THAW_MS } from "../../src/engine/sulk.js";
import { runDailyAffection } from "../../src/jobs/daily-affection.js";
import { busy3EndedYesterday, runProactiveTick } from "../../src/jobs/proactive.js";
import { extractMemories } from "../../src/jobs/memory-extract.js";
import type { LlmRequest, LlmResponse } from "../../src/llm/index.js";
import { loadGuards } from "../../src/policy/rules.js";

const { disclosures, memories, messages, relationships, users } = schema;
const db = drizzle(new PGlite(), { schema });
const rules = loadGuards("content/policy/guards.yaml");
const T0 = new Date("2026-12-01T03:00:00Z"); // 12:00 KST
const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;
const at = (min: number) => new Date(T0.getTime() + min * MIN);
const atDay = (d: number, extraMin = 0) => new Date(T0.getTime() + d * DAY + extraMin * MIN);

let calls: LlmRequest[] = [];
const llm = vi.fn(async (req: LlmRequest): Promise<LlmResponse> => {
  calls.push(req);
  return { text: "Hey, good to hear from you.", model: req.model };
});
let userId = "";
let relId = "";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});
beforeEach(async () => {
  calls = [];
  llm.mockClear();
  delete process.env.DAILY_QUOTA_OVERRIDE;
  const [u] = await db.insert(users).values({ displayName: "t" }).returning();
  userId = u!.id;
  const [r] = await db.insert(relationships).values({ userId, characterId: "ihan", mode: "romance", startedAt: T0 }).returning();
  relId = r!.id;
});

const send = (text: string, now: Date) => handleUserMessage({ db, llm, rules, memoryMode: "rules", now }, userId, text);
const rel = async () => (await db.select().from(relationships).where(eq(relationships.id, relId)))[0]!;
const setRel = (v: Partial<typeof relationships.$inferInsert>) => db.update(relationships).set(v).where(eq(relationships.id, relId));
const chars = () => db.select().from(messages).where(and(eq(messages.relId, relId), eq(messages.sender, "char"))).orderBy(asc(messages.at));
const lastSystem = () => calls.at(-1)!.messages[0]!.content;

describe("affection 규칙(순수)", () => {
  it("단계 경계: 균등 5분할", () => {
    const s = [0, 19, 20, 39, 40, 59, 60, 79, 80, 100].map((v) => stageOf(v, 5));
    expect(s).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
  it("메시지 +1, 답 +2, 일 상한 +5", () => {
    expect(messageGain(0, false)).toBe(1);
    expect(messageGain(0, true)).toBe(3);
    expect(messageGain(4, true)).toBe(1);
    expect(messageGain(DAILY_CAP, false)).toBe(0);
  });
  it("감쇠: 1~3일째 -2, 4일째부터 -1", () => {
    expect([0, 1, 3, 4, 9].map(decayFor)).toEqual([0, 2, 2, 1, 1]);
  });
});

describe("affection(DB)", () => {
  it("일 상한 +5, 단계 상승, 질문에 답하면 +2", async () => {
    for (let i = 0; i < 8; i++) await send(`hello ${i}`, at(i));
    expect((await rel()).affection).toBe(5);
    // 다음 날은 다시 오른다. 그의 직전 말이 질문이면 +2.
    await db.insert(messages).values({ relId, sender: "char", text: "How was your day?", at: atDay(1, -5), deliverAt: atDay(1, -5) });
    await send("it was fine", atDay(1));
    expect((await rel()).affection).toBe(8);
  });
  it("단계가 오르면 해금 비밀 1개가 대기된다(disclosures는 말한 뒤)", async () => {
    await setRel({ affection: 39 });
    await send("hi", at(0));
    const r = await rel();
    expect(r.stage).toBe(3);
    expect(r.pendingSecret).toBe("S1");
    expect(await db.select().from(disclosures)).toHaveLength(0);
  });
  it("일 배치 감쇠: 같은 날 두 번 깎지 않고, 4일째부터 -1, 0 아래로 내려가지 않는다, 단계가 내려간다", async () => {
    await setRel({ affection: 20, stage: 2 });
    await db.insert(messages).values({ relId, sender: "user", text: "last", at: T0, deliverAt: T0 });
    await runDailyAffection({ db, now: atDay(1, 60) });
    expect((await rel()).affection).toBe(18);
    expect((await rel()).stage).toBe(1);
    await runDailyAffection({ db, now: atDay(1, 120) });
    expect((await rel()).affection).toBe(18);
    await runDailyAffection({ db, now: atDay(5) });
    expect((await rel()).affection).toBe(17);
    await setRel({ affection: 1 });
    await runDailyAffection({ db, now: atDay(6) });
    await runDailyAffection({ db, now: atDay(7) });
    expect((await rel()).affection).toBe(0);
  });
});

describe("sulk", () => {
  it("전이(순수): mild→sulking(24h)→thawing(48h)→none(+12h)", () => {
    const t = T0;
    expect(advanceSulk("mild", t, new Date(t.getTime() + 23 * HOUR)).state).toBe("mild");
    expect(advanceSulk("mild", t, new Date(t.getTime() + 25 * HOUR)).state).toBe("sulking");
    const th = advanceSulk("sulking", t, new Date(t.getTime() + NATURAL_MS + HOUR));
    expect(th.state).toBe("thawing");
    expect(advanceSulk("thawing", th.since, new Date(th.since!.getTime() + THAW_MS + 1)).state).toBe("none");
    expect(advanceSulk("none", null, t).state).toBe("none");
  });
  it("3일 공백 뒤 복귀 → 토라짐, 답장 프롬프트에 1문장 지시, 선톡 중단", async () => {
    await send("hi", at(0));
    await send("hello again", atDay(4));
    expect((await rel()).sulkState).toBe("mild");
    expect(lastSystem()).toContain("at most one short sentence");
    await runProactiveTick({ db, now: atDay(4, 600), llm, rules, push: async () => 0 });
    expect((await chars()).filter((c) => c.origin === "proactive")).toHaveLength(0);
  });
  it("2일 공백이면 토라지지 않는다", async () => {
    await send("hi", at(0));
    await send("hello again", atDay(2));
    expect((await rel()).sulkState).toBe("none");
  });
  it("사과(sorry|remember)로 해소 → thawing → 12시간 뒤 none, 지시 사라짐", async () => {
    await send("hi", at(0));
    await send("I'm so sorry I disappeared", atDay(4));
    expect((await rel()).sulkState).toBe("thawing");
    expect(lastSystem()).not.toContain("at most one short sentence");
    await runDailyAffection({ db, now: atDay(4, 13 * 60) });
    expect((await rel()).sulkState).toBe("none");
  });
  it("48시간 자연 해소", async () => {
    await send("hi", at(0));
    await send("hello again", atDay(4));
    await runDailyAffection({ db, now: atDay(4, 49 * 60) });
    expect((await rel()).sulkState).toBe("thawing");
    await runDailyAffection({ db, now: atDay(7) });
    expect((await rel()).sulkState).toBe("none");
  });
  it("약속에 24시간 무응답이면 토라짐, 답하면 약속이 지워진다", async () => {
    await setRel({ promiseAt: T0 });
    await runDailyAffection({ db, now: at(23 * 60) });
    expect((await rel()).sulkState).toBe("none");
    await runDailyAffection({ db, now: at(25 * 60) });
    expect((await rel()).sulkState).toBe("mild");
    await setRel({ sulkState: "none", sulkSince: null, promiseAt: T0 });
    await send("sure, sounds good", at(60));
    expect((await rel()).promiseAt).toBeNull();
  });
});

describe("이별", () => {
  const BREAKUP = parseScene(readFileSync("content/characters/ihan/scenes/breakup.md", "utf8"))!;

  it("breaker → 확인 질문(LLM 0회·한도 미소모) → 긍정 → 이별 장면 + ended_at", async () => {
    await send("I cheated on you with someone.", at(0));
    expect(llm).not.toHaveBeenCalled();
    expect((await rel()).pendingBreaker).toBe("B1");
    expect((await chars()).map((c) => c.text)).toEqual([BREAKUP.confirmLine]);
    expect((await rel()).endedAt).toBeNull();
    await send("yes I did", at(5));
    const r = await rel();
    expect(r.endedAt).not.toBeNull();
    expect(r.pendingBreaker).toBeNull();
    expect((await chars()).map((c) => c.text)).toEqual([BREAKUP.confirmLine, ...BREAKUP.bubbles]);
    expect(llm).not.toHaveBeenCalled();
    // 이별 뒤에는 대화를 받지 않는다.
    expect(await send("hello?", at(10))).toBe("ended");
  });
  it("표시 순서: breaker 고백 → 확인 질문 → 긍정 → 이별 장면의 at이 단조 증가하고 각 사용자 메시지보다 뒤", async () => {
    await send("I cheated on you with someone.", at(0));
    await send("yes I did", at(5));
    const all = await db.select().from(messages).where(eq(messages.relId, relId)).orderBy(asc(messages.at));
    const times = all.map((m) => m.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
    expect(all.map((m) => m.sender)).toEqual(["user", "char", "user", ...BREAKUP.bubbles.map(() => "char")]);
    const users = all.filter((m) => m.sender === "user");
    const confirm = all[1]!;
    expect(confirm.at.getTime()).toBeGreaterThanOrEqual(users[0]!.at.getTime() + 1000);
    for (const c of all.slice(3)) expect(c.at.getTime()).toBeGreaterThanOrEqual(users[1]!.at.getTime() + 1000);
  });
  it("표시 순서: 일반 답장도 사용자 메시지보다 1초 이상 뒤", async () => {
    await send("hello there", at(0));
    const all = await db.select().from(messages).where(eq(messages.relId, relId)).orderBy(asc(messages.at));
    expect(all.map((m) => m.sender)).toEqual(["user", "char"]);
    expect(all[1]!.at.getTime()).toBeGreaterThanOrEqual(all[0]!.at.getTime() + 1000);
  });
  it("첫 3개 사용자 메시지의 답장은 0~2분 안에 도착한다", async () => {
    for (let i = 0; i < 3; i++) {
      const now = at(i * 60);
      await send(`hello ${i}`, now);
      const cs = await chars();
      expect(cs.at(-1)!.deliverAt.getTime() - now.getTime()).toBeLessThanOrEqual(2 * MIN);
    }
  });
  it("4번째 메시지부터 단계별 지연(stage 1: 5~30분 x 배수)을 적용한다", async () => {
    for (let i = 0; i < 3; i++) await send(`hello ${i}`, at(i * 60));
    const now = at(180);
    await send("hello 3", now);
    const d = (await chars()).at(-1)!.deliverAt.getTime() - now.getTime();
    expect(d).toBeGreaterThanOrEqual(5 * MIN);
  });
  it("부정이면 해제되고 일반 답장으로 이어진다", async () => {
    await send("I cheated on you with someone.", at(0));
    await send("no, I was kidding", at(5));
    const r = await rel();
    expect(r.endedAt).toBeNull();
    expect(r.pendingBreaker).toBeNull();
    expect(llm).toHaveBeenCalledTimes(1);
  });
  it("정상 발화는 확인 질문 없이 그대로 답한다", async () => {
    await send("my ex cheated on me", at(0));
    expect((await rel()).pendingBreaker).toBeNull();
    expect(llm).toHaveBeenCalledTimes(1);
  });
  it("결제·방치·한도로는 ended 불가", async () => {
    process.env.DAILY_QUOTA_OVERRIDE = "0";
    for (let i = 0; i < 4; i++) await send(`m${i}`, at(i));
    for (const d of [3, 10, 40, 100, 400]) await runDailyAffection({ db, now: atDay(d) });
    expect((await rel()).endedAt).toBeNull();
    // 소스 확인: ended_at에 값을 쓰는 코드는 breakup.ts 하나뿐(null로 되돌리는 reconcile 제외).
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
    const writers = files("src").filter((f) => /endedAt: (?!null|relationships\.)/.test(readFileSync(f, "utf8")) && !f.endsWith("schema/personal.ts"));
    expect(writers).toEqual([join("src", "engine", "breakup.ts")]);
  });
});

describe("reconcile", () => {
  const ENDED = T0;
  beforeEach(async () => {
    await setRel({ endedAt: ENDED });
    await db.insert(memories).values({ relId, fact: "I have a dog named Momo." });
  });
  const long = "I'm sorry for what I did. I should have told you the truth earlier, and I understand if it hurt.";

  it("30일 전에는 거부(저장·변경 없음), 상태는 waiting", async () => {
    expect(await reconcileStatus(db, relId, atDay(29))).toBe("waiting");
    expect(await handleReconcile({ db, now: atDay(29), memoryMode: "rules" }, userId, long)).toBe("too_early");
    expect(await db.select().from(messages).where(eq(messages.relId, relId))).toHaveLength(0);
    expect((await rel()).endedAt).not.toBeNull();
  });
  it("30일 뒤 짧은 사과는 거절 → +14일, 진정한 사과는 수락(기억 유지)", async () => {
    expect(await handleReconcile({ db, now: atDay(31), memoryMode: "rules" }, userId, "sorry")).toBe("declined");
    const r = await rel();
    expect(r.endedAt).not.toBeNull();
    expect(r.reconcileAfter!.getTime()).toBe(atDay(31).getTime() + 14 * DAY);
    const decline = parseScene(readFileSync("content/characters/ihan/scenes/reconcile-decline.md", "utf8"))!;
    expect((await chars()).map((c) => c.text)).toEqual(decline.bubbles);
    expect(await reconcileStatus(db, relId, atDay(40))).toBe("waiting");
    expect(await handleReconcile({ db, now: atDay(40), memoryMode: "rules" }, userId, long)).toBe("too_early");
    expect(await handleReconcile({ db, now: atDay(46), memoryMode: "rules" }, userId, long)).toBe("accepted");
    const a = await rel();
    expect(a.endedAt).toBeNull();
    expect(a.reconciledAt).not.toBeNull();
    expect((await db.select().from(memories).where(eq(memories.relId, relId))).map((m) => m.fact)).toContain("I have a dog named Momo.");
    const accept = parseScene(readFileSync("content/characters/ihan/scenes/reconcile-accept.md", "utf8"))!;
    expect((await chars()).map((c) => c.text).slice(-accept.bubbles.length)).toEqual(accept.bubbles);
    expect(await send("hi", atDay(47))).toBe("ok");
  });
});

describe("2층 프로필", () => {
  const userMsgs = (n: number, text: string, from: Date) =>
    db.insert(messages).values(Array.from({ length: n }, (_, i) => ({ relId, sender: "user", text, at: new Date(from.getTime() + i * MIN), deliverAt: from })));

  it("기억 추출이 profile_suggestions를 누적한다", async () => {
    await userMsgs(4, "haha I'm tired but let's talk, I miss you", T0);
    await extractMemories(db, relId, atDay(1), { mode: "rules" });
    const s = (await rel()).profileSuggestions as Record<string, number>;
    expect(s.n).toBe(4);
    expect(s.playfulness).toBe(1);
    expect(s.weakness_shown).toBe(1);
  });
  it("14일 또는 60건에 확정, 그 뒤 불변", async () => {
    await userMsgs(3, "haha let's go", T0);
    await extractMemories(db, relId, atDay(1), { mode: "rules" });
    expect(await maybeFreezeProfile(db, relId, atDay(13))).toBe(false);
    expect(await maybeFreezeProfile(db, relId, atDay(14))).toBe(true);
    const frozen = await rel();
    expect(frozen.frozenAt).not.toBeNull();
    expect(frozen.profile).toMatchObject({ playfulness: 1 });
    await userMsgs(3, "I'm sad and scared", atDay(15));
    await extractMemories(db, relId, atDay(16), { mode: "rules" });
    await maybeFreezeProfile(db, relId, atDay(30));
    const after = await rel();
    expect(after.profile).toEqual(frozen.profile);
    expect(after.profileSuggestions).toEqual(frozen.profileSuggestions);
    expect(after.frozenAt).toEqual(frozen.frozenAt);
    // persona에 경향이 들어가되 숫자는 없다.
    await send("hello", atDay(31));
    expect(lastSystem()).toContain("Playful banter from them: high");
  });
  it("사용자 메시지 60건이면 14일 전에도 확정", async () => {
    await userMsgs(60, "hello", T0);
    expect(await maybeFreezeProfile(db, relId, atDay(1))).toBe(true);
  });
});

describe("비밀 해금", () => {
  it("대기 비밀은 낮에는 말하지 않고, 밤(사용자 tz 22~01시) 또는 힘들다고 한 뒤 1회만 지시 + disclosures", async () => {
    await setRel({ pendingSecret: "S1", stage: 3, affection: 45 });
    await send("hi", at(0)); // 12:00 KST
    expect(lastSystem()).not.toContain("이번에 한 번만 털어놓기");
    await send("I'm so tired today", at(10));
    expect(lastSystem()).toContain("이번에 한 번만 털어놓기");
    expect(await db.select().from(disclosures)).toHaveLength(1);
    expect((await rel()).pendingSecret).toBeNull();
    await send("I'm so tired again", at(20));
    expect(lastSystem()).not.toContain("이번에 한 번만 털어놓기");
  });
  it("밤 시간이면 말한다", async () => {
    await setRel({ pendingSecret: "S2", stage: 3, affection: 45 });
    await send("hi", at(11 * 60)); // 23:00 KST
    expect(lastSystem()).toContain("이번에 한 번만 털어놓기");
  });
});

describe("보상 이벤트", () => {
  it("busy=3 구간이 끝난 다음 날 첫 선톡이 reward 장면(결정적 1개), {{photo}} 제거", async () => {
    // busy=3 구간이 어제 끝난 낮 12시(KST)를 찾는다.
    let when: Date | null = null;
    for (let d = 0; d < 120 && !when; d++) {
      const t = new Date(Date.parse("2026-12-01T03:00:00Z") + d * DAY);
      if (await busy3EndedYesterday(db, 2, t)) when = t;
    }
    expect(when, "보상 조건을 만족하는 날 없음").not.toBeNull();
    await setRel({ stage: 2, startedAt: new Date(when!.getTime() - 20 * DAY) });
    await db.insert(messages).values({ relId, sender: "user", text: "morning", at: new Date(when!.getTime() - 20 * HOUR), deliverAt: when! });
    // 정오에 선톡 가능한 날이 아닐 수 있어 오전~저녁 시각을 훑는다.
    for (const h of [0, 2, 4, 6, 8, 10]) {
      await runProactiveTick({ db, now: new Date(when!.getTime() + h * HOUR), llm, rules, push: async () => 0 });
      if ((await chars()).length) break;
    }
    const rewards = (await chars()).filter((c) => c.tag === "reward");
    expect(rewards.length).toBeGreaterThanOrEqual(2);
    expect(rewards.every((c) => !c.text.includes("{{"))).toBe(true);
    expect((await chars()).filter((c) => c.tag !== "reward")).toHaveLength(0);
    const ids = ["reward-1", "reward-2", "reward-3"].map((id) => parseScene(readFileSync(`content/characters/ihan/scenes/${id}.md`, "utf8"))!);
    const first = rewards[0]!.text;
    expect(ids.some((s) => s.bubbles[0]!.replace("{{photo}}", "").trim() === first)).toBe(true);
  });
});

describe("affection 숫자 비노출", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  it("src/app은 숫자를 읽지 않는다: engine/affection import 없음, affection 언급은 가입 시 0으로 초기화하는 한 곳뿐", () => {
    const hits = files("src/app").filter((f) => readFileSync(f, "utf8").toLowerCase().includes("affection"));
    expect(hits).toEqual([join("src", "app", "onboarding", "actions.ts")]);
    expect(readFileSync(hits[0]!, "utf8").match(/affection[^\n]*/gi)?.every((l) => /affection: 0/.test(l))).toBe(true);
    for (const f of files("src/app")) expect(readFileSync(f, "utf8"), f).not.toMatch(/engine\/affection/);
  });
  it("persona 프롬프트에 애정 수치·profile 수치가 없다", async () => {
    await setRel({ affection: 47, stage: 3 });
    await send("hello", at(0));
    expect(lastSystem()).not.toMatch(/\b47\b/);
  });
});
