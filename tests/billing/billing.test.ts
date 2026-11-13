import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getBillingProvider, getPlanView } from "../../src/billing/index.js";
import { mockCancel, mockSubscribe } from "../../src/billing/mock.js";
import { takePaywall } from "../../src/billing/paywall.js";
import { assertDevOnly, devOnlyEnabled } from "../../src/dev-only.js";
import { consumeQuota } from "../../src/engine/quota.js";
import { activeProvider, complete } from "../../src/llm/index.js";
import * as schema from "../../src/db/schema/index.js";

const { entitlements, users } = schema;
const db = drizzle(new PGlite(), { schema });
const T0 = new Date("2026-12-01T03:00:00Z"); // KST 12-01 12:00
const DAY = 86_400_000;
let userId = "";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  delete process.env.DAILY_QUOTA_OVERRIDE;
  const [u] = await db.insert(users).values({ displayName: "t" }).returning();
  userId = u!.id;
});

const ent = async () => (await db.select().from(entitlements).where(eq(entitlements.userId, userId)))[0]!;

describe("결제 mock", () => {
  it("구독하면 paid·한도 100·기간 +30일", async () => {
    await mockSubscribe(db, userId, T0);
    const e = await ent();
    expect(e.plan).toBe("paid");
    expect(e.dailyQuota).toBe(100);
    expect(e.currentPeriodEnd!.getTime()).toBe(T0.getTime() + 30 * DAY);
    for (let i = 0; i < 6; i++) expect(await consumeQuota(db, userId, T0)).toBe(true);
  });

  it("취소하면 기간 말까지 paid, 지나면 free·한도 5", async () => {
    await mockSubscribe(db, userId, T0);
    await mockCancel(db, userId);
    expect((await getPlanView(db, userId, new Date(T0.getTime() + 29 * DAY))).plan).toBe("paid");
    const after = new Date(T0.getTime() + 31 * DAY);
    for (let i = 0; i < 5; i++) expect(await consumeQuota(db, userId, after)).toBe(true);
    expect(await consumeQuota(db, userId, after)).toBe(false);
    const e = await ent();
    expect(e.plan).toBe("free");
    expect(e.dailyQuota).toBe(5);
  });

  it("provider.createCheckout은 mock 결제 화면 주소", async () => {
    expect(await getBillingProvider(db, { NODE_ENV: "test" }).createCheckout(userId)).toEqual({ url: "/billing/mock-checkout" });
  });
});

describe("src/billing 격리", () => {
  it("world·collective 스키마를 import하지 않는다", () => {
    const files = readdirSync("src/billing").filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(join("src/billing", f), "utf8");
      const imports = src.split("\n").filter((l) => /^\s*(import|export)\b.*\bfrom\b/.test(l));
      for (const l of imports) {
        expect(l, `${f}: ${l}`).not.toMatch(/schema\/(world|collective|index)|\/world|\/collective/);
      }
    }
  });
});

describe("아침 유료 안내", () => {
  const exhaust = async (at: Date) => {
    process.env.DAILY_QUOTA_OVERRIDE = "1";
    await consumeQuota(db, userId, at);
    expect(await consumeQuota(db, userId, at)).toBe(false);
    delete process.env.DAILY_QUOTA_OVERRIDE;
  };

  it("소진 당일은 안 보이고 다음날 첫 진입에 1회만", async () => {
    await exhaust(T0);
    expect(await takePaywall(db, userId, new Date(T0.getTime() + 3600_000), {})).toBe(false);
    const next = new Date(T0.getTime() + DAY);
    expect(await takePaywall(db, userId, next, {})).toBe(true);
    expect(await takePaywall(db, userId, new Date(next.getTime() + 60_000), {})).toBe(false);
  });

  it("이틀 뒤에는 안 보인다", async () => {
    await exhaust(T0);
    expect(await takePaywall(db, userId, new Date(T0.getTime() + 2 * DAY), {})).toBe(false);
  });

  it("paid는 표시하지 않는다", async () => {
    await exhaust(T0);
    await mockSubscribe(db, userId, T0);
    expect(await takePaywall(db, userId, new Date(T0.getTime() + DAY), {})).toBe(false);
  });

  it("PAYWALL_FORCE=1은 조건을 무시하고 그날 1회", async () => {
    expect(await takePaywall(db, userId, T0, { PAYWALL_FORCE: "1" })).toBe(true);
    expect(await takePaywall(db, userId, T0, { PAYWALL_FORCE: "1" })).toBe(false);
  });
});

describe("개발 전용 차단", () => {
  it("production에서는 모두 꺼진다", async () => {
    const prod = { NODE_ENV: "production" };
    expect(devOnlyEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(devOnlyEnabled(prod)).toBe(false);
    expect(() => assertDevOnly("x", prod)).toThrow();
    // mock 결제 대신 Stripe 스텁이 선택된다(mock 아님)
    await expect(getBillingProvider(db, prod).createCheckout(userId)).rejects.toThrow("Stripe");
  });

  it("production에서 LLM_PROVIDER=mock은 예외", async () => {
    const saved = { ...process.env };
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.LLM_PROVIDER = "mock";
    try {
      expect(() => activeProvider()).toThrow();
      await expect(complete({ model: "anthropic/claude-sonnet-5-5", messages: [] })).rejects.toThrow();
    } finally {
      process.env = saved;
    }
  });
});
