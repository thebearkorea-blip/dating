import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { deleteAccount, deleteAllConversations } from "../../src/engine/data-deletion.js";

const { disclosures, events, memories, messages, ratings, relationships, users } = schema;
const db = drizzle(new PGlite(), { schema });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});

async function seed() {
  const [u] = await db.insert(users).values({ displayName: "t" }).returning();
  const [r] = await db.insert(relationships).values({ userId: u!.id, characterId: "ihan", mode: "romance", startedAt: new Date(), stage: 3, affection: 40 }).returning();
  const [m] = await db.insert(messages).values({ relId: r!.id, sender: "user", text: "hi" }).returning();
  await db.insert(memories).values({ relId: r!.id, fact: "likes tea" });
  await db.insert(disclosures).values({ relId: r!.id, secretId: "s1" });
  await db.insert(ratings).values({ msgId: m!.id, userId: u!.id, score: 1 });
  await db.insert(events).values({ userId: u!.id, kind: "signup" });
  return { userId: u!.id, relId: r!.id };
}

describe("데이터 삭제", () => {
  it("대화 삭제: messages·memories·disclosures·ratings 0건, 관계 유지·stage 1", async () => {
    const { userId, relId } = await seed();
    await deleteAllConversations(db as never, userId);
    expect(await db.select().from(messages).where(eq(messages.relId, relId))).toHaveLength(0);
    expect(await db.select().from(memories).where(eq(memories.relId, relId))).toHaveLength(0);
    expect(await db.select().from(disclosures).where(eq(disclosures.relId, relId))).toHaveLength(0);
    expect(await db.select().from(ratings).where(eq(ratings.userId, userId))).toHaveLength(0);
    const [rel] = await db.select().from(relationships).where(eq(relationships.id, relId));
    expect(rel?.stage).toBe(1);
    expect(rel?.affection).toBe(0);
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(1);
  });

  it("계정 삭제: users 0건, account_deleted 이벤트(user_id null)", async () => {
    const { userId } = await seed();
    await deleteAccount(db as never, userId);
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(await db.select().from(relationships).where(eq(relationships.userId, userId))).toHaveLength(0);
    expect(await db.select().from(events).where(eq(events.userId, userId))).toHaveLength(0);
    const ev = await db.select().from(events).where(isNull(events.userId));
    expect(ev.some((e) => e.kind === "account_deleted")).toBe(true);
  });
});

describe("/him", () => {
  it("affection·숫자 단서가 소스에 없다(나이 제외)", () => {
    const src = readFileSync("src/app/him/page.tsx", "utf8");
    expect(src).not.toMatch(/affection|stage|relationships/i);
  });
});
