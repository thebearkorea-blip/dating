import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { immersionMetrics, isBotLike } from "../../src/admin/metrics.js";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { maybeRecordAppOpen } from "../../src/engine/app-open.js";

const { events, messages, relationships, users } = schema;
const db = drizzle(new PGlite(), { schema });
const NOW = new Date("2026-12-20T12:00:00Z");
const z = (iso: string) => new Date(iso);
const hdr = (o: Record<string, string> = {}) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});

describe("app_open 기록", () => {
  it("같은 현지 날 두 번째 렌더는 기록하지 않고, 프리페치·서비스워커 요청은 기록하지 않는다", async () => {
    const [u] = await db.insert(users).values({ displayName: "open", tz: "America/Los_Angeles", createdAt: z("2026-12-01T00:00:00Z") }).returning();
    const count = async () => (await db.select().from(events).where(eq(events.userId, u!.id))).filter((e) => e.kind === "app_open").length;
    const user = { id: u!.id, tz: u!.tz };

    const prefetchHeaders: Record<string, string>[] = [{ "next-router-prefetch": "1" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" }, { "sec-fetch-dest": "serviceworker" }];
    for (const h of prefetchHeaders) {
      expect(await maybeRecordAppOpen(db, user, z("2026-12-05T06:00:00Z"), hdr(h))).toBe(false);
    }
    expect(await count()).toBe(0);

    expect(await maybeRecordAppOpen(db, user, z("2026-12-05T06:00:00Z"), hdr())).toBe(true); // LA 12-04 22:00
    expect(await maybeRecordAppOpen(db, user, z("2026-12-05T07:30:00Z"), hdr())).toBe(false); // LA 12-04 23:30, 같은 날
    expect(await count()).toBe(1);
    expect(await maybeRecordAppOpen(db, user, z("2026-12-05T09:00:00Z"), hdr())).toBe(true); // LA 12-05 01:00, 다음 날(KST로는 같은 날)
    expect(await maybeRecordAppOpen(db, user, z("2026-12-05T12:00:00Z"), hdr())).toBe(false);
    expect(await count()).toBe(2);
  });
});

describe("isBotLike", () => {
  it("en/ja/ko 키워드를 잡고 단어 일부(bottle)는 잡지 않는다", () => {
    expect(["you sound like a bot", "Is this a robot?", "ボットみたい", "機械みたいだね", "봇 같아", "기계 같아"].every(isBotLike)).toBe(true);
    expect(isBotLike("pass me the bottle")).toBe(false);
  });
});

describe("immersionMetrics (시드 10명, 손계산)", () => {
  // now = 2026-12-20 12:00Z. 기본 tz = Asia/Seoul(KST = UTC+9). 가입은 모두 03:00Z(KST 12:00).
  // 재방문 일수 = 현지 날짜 차. 1일 창 1~2일째, 7일 창 6~8일째.
  it("코호트별 1일·7일 재방문율, 선톡 답장률, 봇 발화 수가 손계산과 일치한다", async () => {
    const seed: { key: string; at: string; tz?: string; admin?: boolean; beta?: boolean; opens: string[] }[] = [
      { key: "u1", at: "2026-12-01T03:00:00Z", opens: ["2026-12-02T03:00:00Z", "2026-12-08T03:00:00Z"] }, // d1 O, d7 O (idx 1,7)
      { key: "u2", at: "2026-12-01T03:00:00Z", opens: ["2026-12-03T03:00:00Z", "2026-12-05T03:00:00Z"] }, // d1 O (idx2), d7 X (idx4)
      { key: "u3", at: "2026-12-02T03:00:00Z", opens: ["2026-12-08T03:00:00Z"] }, // d1 X, d7 O (idx6)
      { key: "u4", at: "2026-12-02T03:00:00Z", opens: ["2026-12-10T03:00:00Z", "2026-12-11T03:00:00Z"] }, // d7 O (idx8), idx9 무시
      { key: "u5", at: "2026-12-03T03:00:00Z", opens: ["2026-12-12T03:00:00Z"] }, // idx9 → 둘 다 X
      // LA: 가입 현지 12-02. 12-11 10:00Z = LA 12-11 → idx9 → X (UTC 날짜 차였다면 8이라 O)
      { key: "u6", at: "2026-12-03T03:00:00Z", tz: "America/Los_Angeles", opens: ["2026-12-11T10:00:00Z"] },
      { key: "u7", at: "2026-12-14T03:00:00Z", opens: ["2026-12-15T03:00:00Z"] }, // 6.4일 경과: d1 O, d7 분모 제외
      { key: "u8", at: "2026-12-13T03:00:00Z", opens: ["2026-12-14T03:00:00Z"] }, // 7.4일 경과: d1 O, d7 분모 제외
      { key: "u9", at: "2026-12-01T03:00:00Z", admin: true, opens: ["2026-12-02T03:00:00Z", "2026-12-08T03:00:00Z"] }, // 운영자 제외
      { key: "u10", at: "2026-12-01T03:00:00Z", beta: true, opens: ["2026-12-02T03:00:00Z", "2026-12-08T03:00:00Z"] }, // 베타는 포함(d1 O, d7 O)
    ];
    const rel: Record<string, string> = {};
    for (const s of seed) {
      const [u] = await db
        .insert(users)
        .values({ displayName: s.key, tz: s.tz ?? null, isAdmin: !!s.admin, isBeta: !!s.beta, createdAt: z(s.at) })
        .returning();
      for (const o of s.opens) await db.insert(events).values({ userId: u!.id, kind: "app_open", at: z(o) });
      const [r] = await db.insert(relationships).values({ userId: u!.id, characterId: "ihan", mode: "romance", startedAt: z(s.at) }).returning();
      rel[s.key] = r!.id;
    }
    // 시드 밖 사용자(이전 테스트의 "open" 사용자)는 가입 12-01 00:00Z, LA, 7일 창 계산에 들어간다: LA 가입 현지 11-30,
    // app_open 현지 12-04(idx4), 12-05(idx5) → d1 X, d7 X. 코호트 11-30(월)에 합류(분모 +1).
    const msg = (key: string, sender: string, at: string, text: string, origin: string | null = null) =>
      db.insert(messages).values({ relId: rel[key]!, sender, at: z(at), deliverAt: z(at), text, origin });
    // 선톡: u1 답장 O(+5h), u2 무답 X, u3 +25시간 뒤 답 X, u4는 16시간 전 선톡이라 제외, u9 운영자 제외 → 1/3
    await msg("u1", "char", "2026-12-10T03:00:00Z", "hey", "proactive");
    await msg("u1", "user", "2026-12-10T08:00:00Z", "ok");
    await msg("u2", "char", "2026-12-10T03:00:00Z", "hey", "proactive");
    await msg("u3", "char", "2026-12-10T03:00:00Z", "hey", "proactive");
    await msg("u3", "user", "2026-12-11T04:00:00Z", "late");
    await msg("u4", "char", "2026-12-19T20:00:00Z", "hey", "proactive");
    await msg("u9", "char", "2026-12-10T03:00:00Z", "hey", "proactive");
    await msg("u9", "user", "2026-12-10T04:00:00Z", "ok");
    // 봇 같다: 최근 7일 2건(u5 en, u6 ja), 7일 밖·운영자·일반 문장 제외
    await msg("u5", "user", "2026-12-18T03:00:00Z", "you sound like a bot");
    await msg("u6", "user", "2026-12-19T03:00:00Z", "ボットみたい");
    await msg("u7", "user", "2026-12-10T03:00:00Z", "기계 같아");
    await msg("u9", "user", "2026-12-19T03:00:00Z", "robot");
    await msg("u7", "user", "2026-12-19T03:00:00Z", "see you tomorrow");

    const m = await immersionMetrics(db, NOW);
    // 코호트 11-30: u1~u6 + u10(베타) + "open" 사용자 = 8명. d1: u1, u2, u10 = 3/8. d7: u1, u3, u4, u10 = 4/8.
    // 코호트 12-07: u8 → d1 1/1, d7 0/0. 코호트 12-14: u7 → d1 1/1, d7 0/0.
    expect(m.retention.map((r) => r.cohort)).toEqual(["2026-12-14", "2026-12-07", "2026-11-30"]);
    expect(m.retention[2]).toMatchObject({ d1: { n: 8, hit: 3 }, d7: { n: 8, hit: 4 } });
    expect(m.retention[1]).toMatchObject({ d1: { n: 1, hit: 1 }, d7: { n: 0, hit: 0, rate: null } });
    expect(m.retention[0]).toMatchObject({ d1: { n: 1, hit: 1 }, d7: { n: 0, hit: 0, rate: null } });
    expect(m.retention[2]!.d7.rate).toBeCloseTo(4 / 8);
    expect(m.proactive).toMatchObject({ n: 3, hit: 1 });
    expect(m.botLike).toBe(2);
  });
});
