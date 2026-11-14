import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { decayCap } from "../../src/engine/catch-up.js";
import { pickPhoto } from "../../src/engine/photo-pick.js";
import type { Activity } from "../../src/engine/schedule.js";
import { decideProactive, runProactiveTick, type ProactiveInput } from "../../src/jobs/proactive.js";
import { generateVapidKeys } from "../../src/jobs/push.js";
import type { LlmRequest, LlmResponse } from "../../src/llm/index.js";

const { media, messages, relationships, reviewFindings, users } = schema;

const free: Activity = { kind: "routine", activity: "lunch", busy: 0, mood: "calm", replyDelayRange: { min: 1, max: 5 }, canInitiate: true, tags: [] };
// 2026-12-01 03:00Z = 12:00 KST
const NOW = new Date("2026-12-01T03:00:00Z");
const base: ProactiveInput = {
  now: NOW,
  tz: "Asia/Seoul",
  stage: 2,
  startedAt: new Date("2026-11-20T00:00:00Z"),
  pushWindow: { start: "09:00", end: "23:00" },
  pushMax: 2,
  lastUserAt: new Date("2026-11-30T20:00:00Z"),
  proactiveAts: [],
  activity: free,
  initiativePerDay: 2,
};

describe("decideProactive", () => {
  it("창 안·여유 → 후보", () => expect(decideProactive(base)).not.toBeNull());
  it("창 밖 → null (사용자 시간대 기준)", () => {
    const w = { ...base, pushWindow: { start: "09:00", end: "17:00" } };
    expect(decideProactive(w)).not.toBeNull(); // 서울 12:00
    expect(decideProactive({ ...w, tz: "America/Los_Angeles" })).toBeNull(); // LA 19:00
    expect(decideProactive({ ...base, pushWindow: { start: "13:00", end: "23:00" } })).toBeNull();
  });
  it("push_max 도달 → null", () => {
    const earlier = new Date("2026-12-01T00:30:00Z"); // 09:30 KST, 같은 날
    expect(decideProactive({ ...base, pushMax: 1, proactiveAts: [earlier] })).toBeNull();
  });
  it("4일 공백 → 하루 1회", () => {
    const silent = { ...base, lastUserAt: new Date("2026-11-27T00:00:00Z") };
    expect(decideProactive(silent)).not.toBeNull();
    expect(decideProactive({ ...silent, proactiveAts: [new Date("2026-12-01T00:30:00Z")] })).toBeNull();
    expect(decayCap(4, 1)).toBe(4);
    expect(decayCap(4, 2)).toBe(2);
    expect(decayCap(1, 3)).toBe(1);
    expect(decayCap(4, 9)).toBe(1);
  });
  it("busy=3 → null", () => expect(decideProactive({ ...base, activity: { ...free, busy: 3 } })).toBeNull());
  it("canInitiate=false → null", () => expect(decideProactive({ ...base, activity: { ...free, canInitiate: false } })).toBeNull());
  it("최소 간격 안 → null", () => {
    expect(decideProactive({ ...base, lastUserAt: new Date("2026-12-01T02:30:00Z") })).toBeNull();
  });
  it("같은 입력 → 같은 출력", () => {
    expect(decideProactive(base)).toEqual(decideProactive({ ...base }));
  });
});

describe("선톡 틱(DB)", () => {
  const db = drizzle(new PGlite(), { schema });
  let calls: LlmRequest[] = [];
  const llm = vi.fn(async (req: LlmRequest): Promise<LlmResponse> => {
    calls.push(req);
    return { text: "Just finished lunch. Thinking of you.", model: req.model };
  });
  const push = vi.fn(async () => 1);
  let relId = "";

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    await loadContent(db, "content");
  });
  beforeEach(async () => {
    calls = [];
    llm.mockClear();
    push.mockClear();
    delete process.env.PROACTIVE_PHOTO_RATE;
    await db.delete(messages);
    await db.delete(reviewFindings);
    await db.delete(relationships);
    await db.delete(users);
    const [u] = await db.insert(users).values({ displayName: "t", tz: "Asia/Seoul" }).returning();
    const [r] = await db
      .insert(relationships)
      .values({ userId: u!.id, characterId: "ihan", mode: "romance", stage: 2, startedAt: new Date("2026-11-20T00:00:00Z") })
      .returning();
    relId = r!.id;
  });

  it("후보 수 = LLM 호출 수, 저장 + 푸시, 2번째 틱 0건", async () => {
    // 2026-12-01(화) 12:00 KST = 점심(busy 0)
    const r1 = await runProactiveTick({ db, now: NOW, llm, push });
    expect(r1).toMatchObject({ candidates: 1, saved: 1 });
    expect(llm).toHaveBeenCalledTimes(r1.candidates);
    expect(push).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(messages).where(and(eq(messages.relId, relId), eq(messages.origin, "proactive")));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sender).toBe("char");
    const r2 = await runProactiveTick({ db, now: new Date(NOW.getTime() + 15 * 60000), llm, push });
    expect(r2).toMatchObject({ candidates: 0, saved: 0 });
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it("판정 단계는 LLM 0회(후보 없음)", async () => {
    await runProactiveTick({ db, now: new Date("2026-12-01T17:00:00Z"), llm, push }); // 02:00 KST 취침
    expect(llm).toHaveBeenCalledTimes(0);
  });

  it("생성 실패 → 그 틱은 건너뜀(저장 0, 폴백 없음)", async () => {
    const bad = vi.fn(async () => {
      throw new Error("llm http 500: x");
    });
    const r = await runProactiveTick({ db, now: NOW, llm: bad, push });
    expect(r).toMatchObject({ candidates: 1, saved: 0, skipped: 1 });
    expect(await db.select().from(messages).where(eq(messages.relId, relId))).toHaveLength(0);
  });

  it("빈 응답 → 1회 재시도 후 저장, 계속 비면 건너뜀(빈 텍스트 미저장)", async () => {
    const once = vi.fn(async (req: LlmRequest): Promise<LlmResponse> => ({ text: once.mock.calls.length === 1 ? "  " : "Lunch was good.", model: req.model }));
    const r = await runProactiveTick({ db, now: NOW, llm: once, push });
    expect(once).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ saved: 1, skipped: 0 });
    await db.delete(messages);
    const empty = vi.fn(async (req: LlmRequest): Promise<LlmResponse> => ({ text: "", model: req.model }));
    const r2 = await runProactiveTick({ db, now: NOW, llm: empty, push });
    expect(empty).toHaveBeenCalledTimes(2);
    expect(r2).toMatchObject({ saved: 0, skipped: 1 });
    expect(await db.select().from(messages).where(eq(messages.relId, relId))).toHaveLength(0);
  });
});

describe("photo-pick", () => {
  const db = drizzle(new PGlite(), { schema });
  let relId = "";
  const q = (seed = "s") => ({ relId, characterId: "ihan", situation: "lunch", timeOfDay: "noon", seed });
  const row = (id: string, audience: string, situation = "lunch") => ({
    id,
    characterId: "ihan",
    kind: "photo",
    tags: { situation, time_of_day: "noon", place: "x" },
    audience,
    face: false,
    blobUrl: `${id}.jpg`,
  });

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    await loadContent(db, "content");
    const [u] = await db.insert(users).values({ displayName: "p" }).returning();
    const [r] = await db.insert(relationships).values({ userId: u!.id, characterId: "ihan", mode: "romance", startedAt: NOW }).returning();
    relId = r!.id;
  });
  beforeEach(async () => {
    await db.delete(messages);
    await db.delete(media);
  });

  it("매니페스트(media 행) 없으면 null", async () => expect(await pickPhoto(db, q())).toBeNull());
  it("private 우선", async () => {
    await db.insert(media).values([row("pub1", "public"), row("pri1", "private")]);
    expect(await pickPhoto(db, q())).toBe("pri1");
  });
  it("같은 사용자에게 재사용 금지", async () => {
    await db.insert(media).values([row("a", "private")]);
    expect(await pickPhoto(db, q())).toBe("a");
    await db.insert(messages).values({ relId, sender: "char", text: "hi", mediaId: "a", origin: "proactive" });
    expect(await pickPhoto(db, q())).toBeNull();
    await db.insert(media).values([row("b", "public")]);
    expect(await pickPhoto(db, q())).toBe("b");
  });
  it("실제 매니페스트 적재 후 선택되고 rejected는 적재되지 않으며 재사용 금지 유지", async () => {
    await loadContent(db, "content");
    const rows = await db.select().from(media).where(eq(media.characterId, "ihan"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.id === "ihan-p016")).toBe(false);
    expect(rows.some((r) => r.id === "ihan-p026")).toBe(false); // face=false·source=ai 행은 적재되지 않는다
    const qq = { ...q(), situation: "practice-mirror-front" };
    const first = await pickPhoto(db, qq);
    expect(first).not.toBeNull();
    await db.insert(messages).values({ relId, sender: "char", text: "hi", mediaId: first, origin: "proactive" });
    expect(await pickPhoto(db, qq)).not.toBe(first);
  });
  it("한글 활동 + photo_tags: practice-room 사진이 선택된다", async () => {
    await db.insert(media).values([row("p1", "private", "practice-room-mirror"), row("c1", "private", "convenience-store-night")]);
    const qq = { ...q(), situation: "개인 연습", photoTags: ["practice-room", "mirror", "sneakers"] };
    expect(await pickPhoto(db, qq)).toBe("p1");
  });
  it("한글 활동 + photo_tags: 매칭 없으면 null", async () => {
    await db.insert(media).values([row("c1", "private", "convenience-store-night")]);
    expect(await pickPhoto(db, { ...q(), situation: "개인 연습", photoTags: ["practice-room", "mirror"] })).toBeNull();
  });
  it("photo_tags 없으면 활동명 토큰으로 매칭", async () => {
    await db.insert(media).values([row("t1", "private", "convenience-store-night")]);
    expect(await pickPhoto(db, { ...q(), situation: "convenience store run" })).toBe("t1");
    expect(await pickPhoto(db, { ...q(), situation: "개인 연습" })).toBeNull();
  });
  it("상황이 안 맞으면 null", async () => {
    await db.insert(media).values([row("c", "private", "convenience store")]);
    expect(await pickPhoto(db, q())).toBeNull();
  });
});

describe("vapid", () => {
  it("키 한 쌍 생성(값은 출력하지 않음)", () => {
    const k = generateVapidKeys();
    expect(k.publicKey.length).toBeGreaterThan(40);
    expect(k.privateKey.length).toBeGreaterThan(20);
  });
});
