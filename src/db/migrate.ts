// 사용법: node --import tsx src/db/migrate.ts
// 1) drizzle-kit generate로 drizzle/ 에 SQL 생성(스키마 변경이 없으면 아무것도 만들지 않는다)
// 2) PGlite(.data/pglite)에 적용
// sql/roles.sql(역할·GRANT)은 Neon에서만 실행한다. PGlite에서는 실행하지 않는다.
import { execFileSync } from "node:child_process";
import { migrate } from "drizzle-orm/pglite/migrator";
import { closeDb, getDb } from "./client";

execFileSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "generate"], { stdio: "inherit" });
await migrate(getDb(), { migrationsFolder: "drizzle" });
console.log("migrate: ok");
await closeDb();
