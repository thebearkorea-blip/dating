import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { buildUserExport } from "../../src/engine/data-export.js";
import { getQuotaToday } from "../../src/engine/quota.js";

const { entitlements, events, memories, messages, reactions, relationships, users } = schema;
const db = drizzle(new PGlite(), { schema });
const now = new Date("2026-11-17T03:00:00Z");

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});

async function seed(tag: string) {
  const [u] = await db.insert(users).values({ displayName: tag }).returning();
  const [r] = await db.insert(relationships).values({ userId: u!.id, characterId: "ihan", mode: "romance", startedAt: now, stage: 2, affection: 77, sulkState: "mild" }).returning();
  const [m] = await db.insert(messages).values({ relId: r!.id, sender: "user", text: `${tag}-hello`, deliverAt: new Date(now.getTime() - 60000) }).returning();
  await db.insert(messages).values({ relId: r!.id, sender: "char", text: `${tag}-future`, deliverAt: new Date(now.getTime() + 60000) });
  await db.insert(memories).values([
    { relId: r!.id, fact: `${tag}-visible` },
    { relId: r!.id, fact: `${tag}-hidden`, userVisible: false },
    { relId: r!.id, fact: `${tag}-deleted`, deletedAt: now },
  ]);
  await db.insert(reactions).values({ msgId: m!.id, userId: u!.id, by: "user", emoji: "❤️", at: new Date(now.getTime() - 1000) });
  await db.insert(events).values({ userId: u!.id, kind: "signup" });
  return u!.id;
}

describe("내 데이터 내보내기", () => {
  it("본인 행만, 숨김 컬럼·미도착 메시지·숨긴 기억 제외", async () => {
    const a = await seed("alice");
    const b = await seed("bob");
    const out = await buildUserExport(db as never, a, now);
    const json = JSON.stringify(out);
    expect(json).toContain("alice-hello");
    expect(json).toContain("alice-visible");
    expect(json).not.toContain("bob");
    expect(json).not.toContain("alice-future");
    expect(json).not.toContain("alice-hidden");
    expect(json).not.toContain("alice-deleted");
    expect(out.reactions).toHaveLength(1);
    expect(out.events).toHaveLength(1);
    const rel = out.relationships[0] as Record<string, unknown>;
    for (const k of ["affection", "sulkState", "sulkSince", "pendingBreaker", "pendingSecret", "profile", "profileSuggestions", "affectionDay"]) expect(rel).not.toHaveProperty(k);
    const other = await buildUserExport(db as never, b, now);
    expect(JSON.stringify(other)).not.toContain("alice");
  });
});

describe("남은 횟수", () => {
  it("행 없음=무료 5, 사용분 차감, 다른 날이면 0부터", async () => {
    const [u] = await db.insert(users).values({ displayName: "q" }).returning();
    expect(await getQuotaToday(db as never, u!.id, now)).toEqual({ limit: 5, left: 5 });
    await db.insert(entitlements).values({ userId: u!.id, plan: "free", dailyQuota: 5, quotaUsedToday: 2, quotaDay: "2026-11-17" });
    expect(await getQuotaToday(db as never, u!.id, now)).toEqual({ limit: 5, left: 3 });
    expect(await getQuotaToday(db as never, u!.id, new Date("2026-11-18T03:00:00Z"))).toEqual({ limit: 5, left: 5 });
  });
});
