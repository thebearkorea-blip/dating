// 페르소나 재료 조립(M3·M5 남은 점 ①): 답장 경로(chat.ts)와 persona-regress가 같은 조립 함수를 쓴다.
// 리팩터링 전후로 system 문구가 바이트 동일해야 하므로 파일 스냅샷으로 고정한다.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { handleUserMessage } from "../../src/engine/chat.js";
import { loadGuards } from "../../src/policy/rules.js";
import type { LlmRequest, LlmResponse } from "../../src/llm/index.js";
import { buildFreshPersona } from "../../src/tools/persona-regress.js";

const { relationships, users } = schema;
const db = drizzle(new PGlite(), { schema });
const rules = loadGuards("content/policy/guards.yaml");
const NOW = new Date("2026-12-01T03:00:00Z"); // 12:00 KST
const ROOT = new URL("../..", import.meta.url).pathname;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});
afterEach(() => {
  delete process.env.PRODUCT;
});

async function chatSystem(product: "us" | "jp", characterId: string, stage: number): Promise<string> {
  process.env.PRODUCT = product;
  const [u] = await db.insert(users).values({ displayName: "t" }).returning();
  await db.insert(relationships).values({ userId: u!.id, characterId, mode: "romance", startedAt: NOW, stage });
  const calls: LlmRequest[] = [];
  const llm = vi.fn(async (req: LlmRequest): Promise<LlmResponse> => {
    calls.push(req);
    return { text: "Hey, good to hear from you.", model: req.model };
  });
  await handleUserMessage({ db, llm, rules, memoryMode: "rules", now: NOW }, u!.id, "hello");
  return calls[0]!.messages[0]!.content as string;
}

describe("persona 조립 스냅샷", () => {
  for (const [product, id, stage] of [["us", "ihan", 1], ["us", "ihan", 3], ["jp", "yeonhu", 1], ["jp", "yeonhu", 3]] as const) {
    it(`chat 답장 system: ${id} stage ${stage}`, async () => {
      await expect(await chatSystem(product, id, stage)).toMatchFileSnapshot(`__snapshots__/chat-system-${id}-${stage}.txt`);
    });
  }
  for (const id of ["ihan", "yeonhu"]) {
    it(`persona-regress 신규 관계 system: ${id}`, async () => {
      await expect(buildFreshPersona(ROOT, id, NOW).system).toMatchFileSnapshot(`__snapshots__/regress-system-${id}.txt`);
    });
  }
  it("조립 결과는 결정적", () => {
    expect(buildFreshPersona(ROOT, "ihan", NOW).system).toBe(buildFreshPersona(ROOT, "ihan", NOW).system);
  });
});
