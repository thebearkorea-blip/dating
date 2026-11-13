import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, it } from "vitest";
import * as schema from "../../src/db/schema/index";
import { createInvite } from "../../src/tools/invite-token";

it("토큰 생성 시 platform_identities 행이 user_id 없이 선생성된다", async () => {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  const token = await createInvite(db, { platform: "tiktok", handle: "@x", dm: "hello" });
  const [row] = await db.select().from(schema.platformIdentities).where(eq(schema.platformIdentities.token, token));
  expect(row).toMatchObject({ platform: "tiktok", handle: "@x", seedMemory: "hello", userId: null });
});
