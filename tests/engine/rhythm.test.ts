// M4 대화 리듬·부재 중 삶: 말풍선 분할, 끼어들기 취소, 한도 1회, 급한 감정 지연 0, 24시간 부재 복귀 문맥, 죄책감 문구 검사기, 무응답 선톡 상한.
import { PGlite } from "@electric-sql/pglite";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { ABSENCE_EVENT_HEADER, absenceBlock, gapEvents, pickGapEvent } from "../../src/engine/absence.js";
import { BUBBLE_CONT_TAG, splitBubbles, splitSentences } from "../../src/engine/bubbles.js";
import { currentActivity, handleUserMessage, recordUserMessage } from "../../src/engine/chat.js";
import { loadChatMeta, seenAtFor } from "../../src/engine/chat-view.js";
import { ruleUrgent } from "../../src/engine/judge.js";
import { kstParts } from "../../src/engine/schedule.js";
import { decideProactive, explainProactive, runProactiveTick, type ProactiveInput } from "../../src/jobs/proactive.js";
import { CHAT_MODEL, JUDGE_MODEL, type LlmRequest, type LlmResponse } from "../../src/llm/index.js";
import { GUILT_PHRASES, guiltFindings } from "../../src/policy/guilt.js";
import { loadGuards } from "../../src/policy/rules.js";
import { character } from "./helpers.js";

const { entitlements, messages, relationships, users } = schema;

const END = /[.!?。！？]["')\]」』）]*$/;
const norm = (s: string) => s.replace(/\s+/g, "");

describe("splitBubbles (순수)", () => {
  const cases: [string, string][] = [
    ["en", "Practice ran late again. My legs are basically jelly now. Hajun made everyone ramen after, which was sweet. Did you eat something good today?"],
    ["ja", "今日は練習が長引いた。足がもう限界。でもハジュンがラーメン作ってくれて、ちょっと元気出た！そっちは何食べた？"],
    ["ko", "오늘 연습이 또 늦게 끝났어. 다리가 완전 풀렸어. 그래도 하준이가 라면 끓여줘서 좀 살았어! 너는 오늘 뭐 먹었어?"],
  ];
  for (const [lang, text] of cases) {
    it(`${lang}: 문장 경계에서 최대 3개, 간격 2~6초, 이어 붙이면 원문`, () => {
      const b = splitBubbles(text, `seed-${lang}`);
      expect(b.length).toBeGreaterThanOrEqual(2);
      expect(b.length).toBeLessThanOrEqual(3);
      expect(b[0]!.offsetMs).toBe(0);
      for (let i = 1; i < b.length; i++) {
        const gap = b[i]!.offsetMs - b[i - 1]!.offsetMs;
        expect(gap).toBeGreaterThanOrEqual(2000);
        expect(gap).toBeLessThanOrEqual(6000);
      }
      for (const x of b) expect(x.text).toMatch(END);
      expect(norm(b.map((x) => x.text).join(""))).toBe(norm(text));
      // 결정적
      expect(splitBubbles(text, `seed-${lang}`)).toEqual(b);
    });
  }

  it("짧은 답·한 문장은 1개", () => {
    expect(splitBubbles("Hey. You up?", "s")).toHaveLength(1);
    expect(splitBubbles("Just got back from practice and I'm thinking about the bridge part of the new song all night", "s")).toHaveLength(1);
    expect(splitBubbles("うん、そうだね。", "s")).toHaveLength(1);
  });

  it("말줄임·소수점은 경계가 아니다", () => {
    expect(splitSentences("Well... I guess it was 3.5 hours. Long day.")).toEqual(["Well... I guess it was 3.5 hours.", "Long day."]);
  });
});

describe("죄책감 문구 검사기", () => {
  it("언어별 목록의 문구를 잡는다", () => {
    const bad = ["I waited for you all night.", "I missed you so much!", "Where have you been?", "Why didn't you reply?", "ずっと待ってたよ", "どこ行ってたの？", "계속 기다렸어", "어디 갔었어?"];
    for (const t of bad) expect(guiltFindings(t), t).not.toHaveLength(0);
    expect(Object.keys(GUILT_PHRASES).sort()).toEqual(["en", "ja", "ko"]);
  });
  it("평범한 반가움은 통과", () => {
    for (const t of ["Hey, good to see you. I went to the river yesterday.", "おかえり。昨日は撮影だったよ。", "왔구나. 어제는 녹음했어."]) expect(guiltFindings(t), t).toEqual([]);
  });
});

describe("급한 감정 키워드(rules)", () => {
  it("en/ja/ko 급한 발화는 true, 평범한 피곤은 false", () => {
    for (const t of ["I'm crying and I can't stop", "I just got fired", "泣いてる。仕事クビになった", "울고 있어 방금 해고당했어"]) expect(ruleUrgent(t), t).toBe(true);
    for (const t of ["so tired today lol", "今日は疲れた", "오늘 좀 피곤해"]) expect(ruleUrgent(t), t).toBe(false);
  });
});

describe("부재 사건(순수)", () => {
  const from = new Date("2026-12-01T03:00:00Z");
  const to = new Date("2026-12-03T05:00:00Z");
  it("일기가 있으면 일기, 없으면 일정 활동, 고른 것은 1개·결정적", () => {
    const diary = [{ date: "2026-12-02", body: "First paragraph.\n\nSecond." }, { date: "2026-12-03", body: "Other day." }];
    expect(gapEvents(character, from, to, -150, 1, diary).map((e) => e.source)).toEqual(["diary", "diary"]);
    expect(gapEvents(character, from, to, -150, 1, diary)[0]!.text).toBe("First paragraph.");
    const routine = gapEvents(character, from, to, -150, 1, []);
    expect(routine.length).toBeGreaterThan(0);
    const picked = pickGapEvent(routine, "x");
    expect(pickGapEvent(routine, "x")).toEqual(picked);
    const block = absenceBlock(picked, to.getTime() - from.getTime());
    expect(block.split(ABSENCE_EVENT_HEADER).length - 1).toBe(1);
    expect(block).toContain("Do not guilt them");
  });
});

describe("무응답 선톡 상한(explainProactive)", () => {
  const NOW = new Date("2026-12-01T03:00:00Z");
  const base: ProactiveInput = {
    now: NOW,
    tz: "Asia/Seoul",
    stage: 2,
    startedAt: new Date("2026-11-20T00:00:00Z"),
    pushWindow: { start: "09:00", end: "23:00" },
    pushMax: 2,
    lastUserAt: new Date("2026-11-30T12:00:00Z"),
    proactiveAts: [],
    activity: { kind: "routine", activity: "lunch", busy: 0, mood: "calm", replyDelayRange: { min: 1, max: 5 }, canInitiate: true, tags: [] },
    initiativePerDay: 2,
  };
  it("답 없는 선톡이 있으면 사유 unanswered_proactive, 그녀가 답하면 다시 후보", () => {
    const sent = new Date("2026-11-30T20:00:00Z");
    expect(explainProactive({ ...base, lastProactiveAt: sent })).toEqual({ reason: "unanswered_proactive" });
    expect(explainProactive({ ...base, lastUserAt: null, lastProactiveAt: sent })).toEqual({ reason: "unanswered_proactive" });
    expect(decideProactive({ ...base, lastUserAt: new Date("2026-11-30T21:00:00Z"), lastProactiveAt: sent })).not.toBeNull();
    expect(decideProactive({ ...base, lastProactiveAt: null })).not.toBeNull();
  });
});

describe("채팅 리듬(DB)", () => {
  const db = drizzle(new PGlite(), { schema });
  const rules = loadGuards("content/policy/guards.yaml");
  const T0 = new Date("2026-12-01T03:00:00Z");
  const at = (min: number) => new Date(T0.getTime() + min * 60000);
  const LONG = "Practice ran late again. My legs are basically jelly now. Hajun made everyone ramen after, which was sweet. Did you eat something good today?";
  let replyText = LONG;
  let calls: LlmRequest[] = [];
  let judgeJson = '{"breaker":null}';
  const llm = vi.fn(async (req: LlmRequest): Promise<LlmResponse> => {
    calls.push(req);
    return { text: req.model === JUDGE_MODEL ? judgeJson : replyText, model: req.model };
  });
  let userId = "";
  let relId = "";

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    await loadContent(db, "content");
  });
  beforeEach(async () => {
    calls = [];
    replyText = LONG;
    judgeJson = '{"breaker":null}';
    delete process.env.DAILY_QUOTA_OVERRIDE;
    delete process.env.REPLY_DELAY_SCALE;
    delete process.env.PRODUCT;
    const [u] = await db.insert(users).values({ displayName: "t", tz: "Asia/Seoul" }).returning();
    userId = u!.id;
    const [r] = await db.insert(relationships).values({ userId, characterId: "ihan", mode: "romance", startedAt: T0 }).returning();
    relId = r!.id;
  });

  const deps = (now: Date, mode: "rules" | "llm" = "rules") => ({ db, llm, rules, memoryMode: mode, now });
  const send = (text: string, now: Date, mode: "rules" | "llm" = "rules") => handleUserMessage(deps(now, mode), userId, text);
  const chars = () =>
    db.select().from(messages).where(and(eq(messages.relId, relId), eq(messages.sender, "char"))).orderBy(asc(messages.deliverAt));
  const used = async () => (await db.select().from(entitlements).where(eq(entitlements.userId, userId)))[0]!.quotaUsedToday;

  it("긴 답 → 풍선 3개, 간격 2~6초, 읽음은 첫 풍선 기준, 한도 1회", async () => {
    await send("how was practice?", at(0));
    const rows = await chars();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.tag)).toEqual([null, BUBBLE_CONT_TAG, BUBBLE_CONT_TAG]);
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i]!.deliverAt.getTime() - rows[i - 1]!.deliverAt.getTime();
      expect(gap).toBeGreaterThanOrEqual(2000);
      expect(gap).toBeLessThanOrEqual(6000);
    }
    expect(norm(rows.map((r) => r.text).join(""))).toBe(norm(LONG));
    const [u] = await db.select().from(messages).where(and(eq(messages.relId, relId), eq(messages.sender, "user")));
    expect(u!.seenAt).toEqual(seenAtFor(u!.id, u!.at, rows[0]!.deliverAt, rows[0]!.text.length));
    expect(await used()).toBe(1);
  });

  it("짧은 답은 한 행", async () => {
    replyText = "Hey. You up?";
    await send("hi", at(0));
    expect(await chars()).toHaveLength(1);
  });

  it("끼어들면 남은 풍선은 취소, 한도는 답 1개 = 1회로 환불", async () => {
    await db.insert(entitlements).values({ userId, plan: "free", dailyQuota: 5, quotaUsedToday: 2, quotaDay: kstParts(T0).date });
    await send("how was practice?", at(0));
    expect(await used()).toBe(3);
    const first = await chars();
    expect(first).toHaveLength(3);
    // 아무 풍선도 전달되기 전에 끼어들기: 3개 모두 지우고 환불 1회(분할 풍선 2·3은 환불하지 않는다) → 2, 새 답 소비 → 3.
    replyText = "Oh wait, tell me first.";
    await send("wait actually", new Date(first[0]!.deliverAt.getTime() - 500));
    const after1 = await chars();
    expect(after1.map((r) => r.text)).toEqual(["Oh wait, tell me first."]);
    expect(await used()).toBe(3);
  });

  it("첫 풍선 전달 뒤 끼어들면 아직 안 간 풍선만 취소, 환불 없음", async () => {
    await send("how was practice?", at(0));
    const first = await chars();
    const cut = new Date(first[0]!.deliverAt.getTime() + 500); // 1번 풍선만 도착
    replyText = "Okay okay.";
    await send("lol stop", cut);
    const rows = await chars();
    expect(rows.filter((r) => r.deliverAt.getTime() <= cut.getTime()).map((r) => r.id)).toEqual([first[0]!.id]);
    expect(rows.some((r) => r.id === first[1]!.id || r.id === first[2]!.id)).toBe(false);
    expect(await used()).toBe(2);
  });

  /** 첫 3개 지연 0 규칙을 소진한 뒤, 대화 중(10분)이 아닌 busy=3 시각. */
  async function busy3After(min: number): Promise<Date> {
    replyText = "Ok.";
    for (let i = 0; i < 3; i++) await send(`hi ${i}`, at(i));
    for (let m = min; m < min + 72 * 60; m += 30) {
      if ((await currentActivity(db, 1, at(m))).busy === 3) return at(m);
    }
    throw new Error("busy3 시각 없음");
  }

  it("급한 감정(rules 키워드) → busy3여도 지연 0, 입력 중은 보낸 뒤 1~2초", async () => {
    const t = await busy3After(360);
    replyText = "Hey. I'm right here. Tell me what happened.";
    await send("I'm crying, I just got fired", t);
    const rows = (await chars()).filter((r) => r.at.getTime() > t.getTime());
    expect(rows[0]!.deliverAt.getTime() - t.getTime()).toBe(1000);
    // 대조: 같은 busy3에서 평범한 말은 지연이 있다.
    const t2 = new Date(t.getTime() + 15 * 60000);
    if ((await currentActivity(db, 1, t2)).busy === 3) {
      replyText = "Ok.";
      await send("what are you doing", t2);
      const r2 = (await chars()).filter((r) => r.at.getTime() > t2.getTime());
      expect(r2[0]!.deliverAt.getTime() - t2.getTime()).toBeGreaterThan(60000);
    }
  });

  it("급한 감정이면 답장 행이 생기기 전에도 busy3에서 입력 중이 1~2초 뒤 켜진다", async () => {
    const t = await busy3After(360);
    await recordUserMessage(deps(t), userId, "I'm crying so hard right now");
    expect((await loadChatMeta(db, { id: relId, stage: 1 }, new Date(t.getTime() + 500))).typing).toBe(false);
    expect((await loadChatMeta(db, { id: relId, stage: 1 }, new Date(t.getTime() + 2100))).typing).toBe(true);
  });

  it("llm 모드: 판단 호출 1회의 urgent 필드로 지연 0(추가 호출 없음)", async () => {
    const t = await busy3After(360);
    calls = [];
    judgeJson = '{"breaker":null,"reaction":"🥺","urgent":true}';
    replyText = "I'm here.";
    await send("something really bad happened", t, "llm");
    const judgeCalls = calls.filter((c) => c.model === JUDGE_MODEL && /"urgent"/.test(String(c.messages[0]?.content)));
    expect(judgeCalls).toHaveLength(1);
    const rows = (await chars()).filter((r) => r.at.getTime() > t.getTime());
    expect(rows[0]!.deliverAt.getTime() - t.getTime()).toBe(1000);
  });

  it("24시간 부재 복귀 → 문맥에 부재 사건 정확히 1개 + 죄책감 금지 지시, 24시간 미만은 없음", async () => {
    replyText = "Ok.";
    await send("night!", at(0));
    calls = [];
    await send("hey I'm back", at(23 * 60));
    const sys0 = String(calls.find((c) => c.model === CHAT_MODEL)!.messages[0]!.content);
    expect(sys0).not.toContain(ABSENCE_EVENT_HEADER);
    calls = [];
    await send("sorry, busy couple of days", at(23 * 60 + 30 * 60));
    const sys = String(calls.find((c) => c.model === CHAT_MODEL)!.messages[0]!.content);
    expect(sys.split(ABSENCE_EVENT_HEADER).length - 1).toBe(1);
    expect(sys).toContain("Do not guilt them");
    // ihan은 일기가 있다: 부재 구간(12-01 다음 날 ~ 복귀일) 일기 중 하나.
    expect(sys).toMatch(new RegExp(`${ABSENCE_EVENT_HEADER} \\(KST 2026-12-0[2-3]\\)`));
  });

  it("선톡 틱: 답 없는 선톡 뒤 2번째는 보내지 않는다(사유 unanswered_proactive)", async () => {
    await db.update(relationships).set({ stage: 2, startedAt: new Date("2026-11-20T00:00:00Z") }).where(eq(relationships.id, relId));
    replyText = "Just finished lunch. Thinking of you.";
    const push = vi.fn(async () => 1);
    const r1 = await runProactiveTick({ db, now: T0, llm, push });
    expect(r1.saved).toBe(1);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const r2 = await runProactiveTick({ db, now: at(6 * 60), llm, push, verbose: true });
    expect(r2.saved).toBe(0);
    expect(log.mock.calls.some((c) => String(c[0]).includes(`rel=${relId.slice(0, 8)} not_candidate: unanswered_proactive`))).toBe(true);
    log.mockRestore();
  });
});
