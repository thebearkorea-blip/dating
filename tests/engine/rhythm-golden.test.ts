// M4 골든 대화 10개(en 5·ja 5, tests/fixtures/rhythm-golden). rules/mock 모드로 돌리고 기계 검사만 한다(몰입 1차 §4-5).
// 풍선 ≤3·간격 2~6초·문장 경계 분할, 끼어들면 남은 풍선 0, 급한 발화 지연 0, 24시간 부재 복귀 문맥 사건 정확히 1개, 죄책감 문구 0, 무응답 선톡 뒤 추가 선톡 0.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadContent } from "../../src/db/load-content.js";
import * as schema from "../../src/db/schema/index.js";
import { ABSENCE_EVENT_HEADER, ABSENCE_MS } from "../../src/engine/absence.js";
import { MAX_BUBBLES } from "../../src/engine/bubbles.js";
import { currentActivity, handleUserMessage } from "../../src/engine/chat.js";
import { runProactiveTick } from "../../src/jobs/proactive.js";
import { CHAT_MODEL, type LlmRequest, type LlmResponse } from "../../src/llm/index.js";
import { guiltFindings } from "../../src/policy/guilt.js";
import { loadGuards } from "../../src/policy/rules.js";

const { messages, relationships, users } = schema;

interface Step {
  after_min?: number;
  after_sec?: number;
  after?: "busy3";
  user?: string;
  reply?: string;
  proactive_sent?: string;
  tick?: boolean;
  expect?: { bubbles?: number; urgent?: boolean; absence?: boolean };
}
interface Conversation {
  id: string;
  stage?: number;
  started_at?: string;
  steps: Step[];
}
interface GoldenFile {
  lang: string;
  product: "us" | "jp";
  character: string;
  conversations: Conversation[];
}

const DIR = join(import.meta.dirname, "../fixtures/rhythm-golden");
const files = ["golden.en.json", "golden.ja.json"].map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as GoldenFile);
const T0 = new Date("2026-12-01T03:00:00Z");
const END = /[.!?。！？]["')\]」』）]*$/;
const norm = (s: string) => s.replace(/\s+/g, "");

const db = drizzle(new PGlite(), { schema });
const rules = loadGuards("content/policy/guards.yaml");
let replyText = "";
let calls: LlmRequest[] = [];
const llm = vi.fn(async (req: LlmRequest): Promise<LlmResponse> => {
  calls.push(req);
  return { text: replyText, model: req.model };
});
const push = vi.fn(async () => 1);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await loadContent(db, "content");
});
afterEach(() => {
  delete process.env.PRODUCT;
  delete process.env.DAILY_QUOTA_OVERRIDE;
});

it("골든은 언어별 5개, 합계 10개", () => {
  expect(files.map((f) => [f.lang, f.conversations.length])).toEqual([
    ["en", 5],
    ["ja", 5],
  ]);
});

for (const file of files) {
  describe(`리듬 골든 ${file.lang}`, () => {
    for (const conv of file.conversations) {
      it(conv.id, async () => {
        process.env.PRODUCT = file.product;
        process.env.DAILY_QUOTA_OVERRIDE = "100";
        const stage = conv.stage ?? 1;
        const [u] = await db.insert(users).values({ displayName: "g", tz: "Asia/Seoul" }).returning();
        const [rel] = await db
          .insert(relationships)
          .values({ userId: u!.id, characterId: file.character, mode: "romance", stage, startedAt: conv.started_at ? new Date(conv.started_at) : T0 })
          .returning();
        const relId = rel!.id;
        const charRows = () => db.select().from(messages).where(and(eq(messages.relId, relId), eq(messages.sender, "char"))).orderBy(asc(messages.deliverAt), asc(messages.id));

        let t = T0;
        let prevUserAt: Date | null = null;
        let prevGroup: string[] = [];
        for (const [i, step] of conv.steps.entries()) {
          const where = `${conv.id} step ${i}`;
          if (step.after === "busy3") {
            let found: Date | null = null;
            for (let m = 360; m < 72 * 60 && !found; m += 30) {
              const x = new Date(t.getTime() + m * 60000);
              if ((await currentActivity(db, stage, x)).busy === 3) found = x;
            }
            expect(found, `${where}: busy3 시각`).not.toBeNull();
            t = found!;
          } else {
            t = new Date(t.getTime() + (step.after_min ?? 0) * 60000 + (step.after_sec ?? 0) * 1000);
          }

          if (step.proactive_sent) {
            await db.insert(messages).values({ relId, at: t, deliverAt: t, sender: "char", text: step.proactive_sent, origin: "proactive" });
            continue;
          }

          if (step.tick) {
            const [lp] = await db.select({ at: messages.at }).from(messages).where(and(eq(messages.relId, relId), eq(messages.origin, "proactive"))).orderBy(desc(messages.at)).limit(1);
            const unanswered = !!lp && (!prevUserAt || prevUserAt < lp.at);
            const log = vi.spyOn(console, "log").mockImplementation(() => {});
            replyText = "Thinking of you.";
            await runProactiveTick({ db, now: t, llm, push, verbose: true });
            const mine = log.mock.calls.map((c) => String(c[0])).filter((l) => l.includes(`rel=${relId.slice(0, 8)} `));
            log.mockRestore();
            if (unanswered) {
              expect(mine.join("\n"), `${where}: 무응답 선톡 뒤`).toContain("not_candidate: unanswered_proactive");
              const after = await db.select().from(messages).where(and(eq(messages.relId, relId), eq(messages.origin, "proactive")));
              expect(after, `${where}: 추가 선톡 0`).toHaveLength(1);
            }
            continue;
          }

          if (!step.user || step.reply === undefined) throw new Error(`${where}: user/reply 없음`);
          // 끼어들기: 이전 답의 아직 안 간 풍선은 이 메시지 처리로 사라져야 한다.
          const before = new Set((await charRows()).map((r) => r.id));
          replyText = step.reply;
          calls = [];
          expect(await handleUserMessage({ db, llm, rules, memoryMode: "rules", now: t }, u!.id, step.user)).toBe("ok");
          if (prevGroup.length) {
            const left = await db.select().from(messages).where(inArray(messages.id, prevGroup));
            expect(left.filter((r) => r.deliverAt.getTime() > t.getTime()), `${where}: 남은 풍선 취소`).toHaveLength(0);
          }
          const rows = (await charRows()).filter((r) => !before.has(r.id) && r.origin === "reply");
          expect(rows.length, `${where}: 풍선 수`).toBeGreaterThanOrEqual(1);
          expect(rows.length, `${where}: 풍선 ≤3`).toBeLessThanOrEqual(MAX_BUBBLES);
          if (step.expect?.bubbles !== undefined) expect(rows.length, `${where}: 기대 풍선 수`).toBe(step.expect.bubbles);
          for (let k = 1; k < rows.length; k++) {
            const gap = rows[k]!.deliverAt.getTime() - rows[k - 1]!.deliverAt.getTime();
            expect(gap, `${where}: 간격`).toBeGreaterThanOrEqual(2000);
            expect(gap, `${where}: 간격`).toBeLessThanOrEqual(6000);
          }
          if (rows.length > 1) for (const r of rows) expect(r.text, `${where}: 문장 경계`).toMatch(END);
          expect(norm(rows.map((r) => r.text).join("")), `${where}: 원문 보존`).toBe(norm(step.reply));
          for (const r of rows) expect(guiltFindings(r.text), `${where}: 죄책감 문구`).toEqual([]);

          if (step.expect?.urgent) {
            expect((await currentActivity(db, stage, t)).busy, `${where}: busy3에서`).toBe(3);
            expect(rows[0]!.deliverAt.getTime() - t.getTime(), `${where}: 지연 0`).toBe(1000);
          }

          const sys = String(calls.find((c) => c.model === CHAT_MODEL)?.messages[0]?.content ?? "");
          const absent = !!prevUserAt && t.getTime() - prevUserAt.getTime() >= ABSENCE_MS;
          if (step.expect?.absence !== undefined) expect(absent, `${where}: 부재 기대`).toBe(step.expect.absence);
          expect(sys.split(ABSENCE_EVENT_HEADER).length - 1, `${where}: 부재 사건 수`).toBe(absent ? 1 : 0);

          prevUserAt = t;
          prevGroup = rows.map((r) => r.id);
        }
      });
    }
  });
}
