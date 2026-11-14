import { mkdirSync } from "node:fs";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema/index";

// DATABASE_URL이 있으면 Neon(neon-serverless Pool, 트랜잭션 지원), 없으면 PGlite(파일 .data/pglite).
// 두 드라이버는 같은 PgDatabase API를 쓰므로 호출자에게는 PgliteDatabase 타입으로 보여 준다.
export type Db = PgliteDatabase<typeof schema>;

const g = globalThis as unknown as { __pglite?: PGlite; __pool?: Pool; __db?: Db };

export function usingNeon(): boolean {
  return !!process.env.DATABASE_URL;
}

export function getDb(): Db {
  if (!g.__db) {
    if (process.env.DATABASE_URL) {
      if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;
      g.__pool = new Pool({ connectionString: process.env.DATABASE_URL });
      g.__db = drizzleNeon(g.__pool, { schema }) as unknown as Db;
    } else {
      mkdirSync(".data", { recursive: true });
      g.__pglite = new PGlite(".data/pglite");
      g.__db = drizzle(g.__pglite, { schema });
    }
  }
  return g.__db;
}

/** 스크립트 종료용. */
export async function closeDb(): Promise<void> {
  await g.__pglite?.close();
  await g.__pool?.end();
  g.__pglite = undefined;
  g.__pool = undefined;
  g.__db = undefined;
}
