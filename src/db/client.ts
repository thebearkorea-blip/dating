import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema/index";

// 로컬 우선: 지금은 PGlite만 쓴다(파일 .data/pglite).
// TODO(Neon): DATABASE_URL이 있으면 drizzle-orm/neon-http + @neondatabase/serverless로 분기한다(패키지 설치 후).
export type Db = PgliteDatabase<typeof schema>;

const g = globalThis as unknown as { __pglite?: PGlite; __db?: Db };

export function getDb(): Db {
  if (!g.__db) {
    mkdirSync(".data", { recursive: true });
    g.__pglite = new PGlite(".data/pglite");
    g.__db = drizzle(g.__pglite, { schema });
  }
  return g.__db;
}

/** 스크립트 종료용. */
export async function closeDb(): Promise<void> {
  await g.__pglite?.close();
  g.__pglite = undefined;
  g.__db = undefined;
}
