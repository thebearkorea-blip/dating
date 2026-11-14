// 사용법: node --env-file=.env.local --import tsx src/db/migrate.ts
// 1) drizzle-kit generate로 drizzle/ 에 SQL 생성(스키마 변경이 없으면 아무것도 만들지 않는다)
// 2) DATABASE_URL이 있으면 Neon에, 없으면 PGlite(.data/pglite)에 적용
// sql/roles.sql(역할·GRANT)은 Neon에서만 실행한다. PGlite에서는 실행하지 않는다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import { closeDb, getDb, usingNeon } from "./client";

execFileSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "generate"], { stdio: "inherit" });
if (usingNeon()) {
  await migrateNeon(getDb() as unknown as NeonDatabase, { migrationsFolder: "drizzle" });
  console.log("migrate: ok (neon)");
  // roles.sql: 문장(세미콜론) 단위로 실행. 이미 있는 역할 등으로 실패한 문장은 보고만 하고 계속한다.
  const text = readFileSync("sql/roles.sql", "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  let ok = 0;
  for (const stmt of text.split(";").map((s) => s.trim()).filter(Boolean)) {
    try {
      await getDb().execute(sql.raw(stmt));
      ok++;
    } catch (e) {
      console.log(`roles.sql 실패: ${stmt.replace(/\s+/g, " ").slice(0, 100)} -> ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`roles.sql: ${ok}문장 성공`);
} else {
  await migratePglite(getDb(), { migrationsFolder: "drizzle" });
  console.log("migrate: ok");
}
await closeDb();
