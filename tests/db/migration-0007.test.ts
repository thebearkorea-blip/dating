import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";

const { users, relationships, messages, reactions } = schema;

function split(file: string): string[] {
  return readFileSync(file, "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
}

describe("마이그레이션 0007 (reply_to·seen_at·reactions·인덱스)", () => {
  it("0006 상태 DB에 0007 SQL 적용 → 되돌림 → 재적용", async () => {
    const pg = new PGlite();
    const db = drizzle(pg, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    const exists = async () =>
      (await pg.query<{ n: number }>(
        `SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='personal' AND table_name='reactions')::int
              + (SELECT count(*) FROM information_schema.columns WHERE table_schema='personal' AND table_name='messages' AND column_name IN ('reply_to','seen_at'))::int
              + (SELECT count(*) FROM pg_indexes WHERE schemaname='personal' AND indexname='messages_rel_deliver_idx')::int AS n`,
      )).rows[0]!.n;
    expect(await exists()).toBe(4); // 테이블1 + 컬럼2 + 인덱스1
    for (const s of readFileSync("drizzle/down/0007_reply_seen_reactions.sql", "utf8").split(";").map((x) => x.replace(/^--.*$/gm, "").trim()).filter(Boolean)) await pg.exec(s);
    expect(await exists()).toBe(0);
    for (const s of split("drizzle/0007_reply_seen_reactions.sql")) await pg.exec(s);
    expect(await exists()).toBe(4);
  });

  it("reply_to 대상 삭제 시 null, 메시지 삭제 시 반응 cascade", async () => {
    const pg = new PGlite();
    const db = drizzle(pg, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    await loadContent(db, "content");
    const [u] = await db.insert(users).values({ displayName: "t" }).returning();
    const [r] = await db.insert(relationships).values({ userId: u!.id, characterId: "ihan", mode: "romance", startedAt: new Date() }).returning();
    const [a] = await db.insert(messages).values({ relId: r!.id, sender: "char", text: "a" }).returning();
    const [b] = await db.insert(messages).values({ relId: r!.id, sender: "user", text: "b", replyTo: a!.id }).returning();
    await db.insert(reactions).values({ msgId: a!.id, userId: u!.id, by: "user", emoji: "👍" });
    await db.insert(reactions).values({ msgId: a!.id, userId: u!.id, by: "char", emoji: "👀", at: new Date(Date.now() + 60000) });
    await db.delete(messages).where(sql`id = ${a!.id}`);
    const [b2] = await db.select().from(messages).where(sql`id = ${b!.id}`);
    expect(b2?.replyTo).toBeNull();
    expect(await db.select().from(reactions)).toHaveLength(0);
  });
});
