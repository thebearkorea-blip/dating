import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import Stripe from "stripe";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getBillingProvider } from "../../src/billing/index.js";
import { applyCheckoutSession, cancelSubscriptionNow, createStripeProvider, type StripeClient, type StripeSub } from "../../src/billing/stripe.js";
import * as schema from "../../src/db/schema/index.js";

const { entitlements, events, users } = schema;
const db = drizzle(new PGlite(), { schema });

vi.mock("@/db/client", () => ({ getDb: () => db }));

const SECRET = "whsec_test_secret";
const real = new Stripe("sk_test_dummy");
const PERIOD_END = 1_800_000_000;

let userId = "";
let subs: Record<string, StripeSub> = {};
let sessions: Record<string, { client_reference_id: string | null; status: string; subscription: string | null }> = {};
let created: Record<string, unknown>[] = [];
let updated: { id: string; params: Record<string, unknown> }[] = [];
let cancelled: string[] = [];

const fake: StripeClient = {
  subscriptions: {
    async retrieve(id) {
      const s = subs[id];
      if (!s) throw Object.assign(new Error("no sub"), { code: "resource_missing" });
      return s;
    },
    async update(id, params) {
      updated.push({ id, params });
      subs[id] = { ...subs[id]!, cancel_at_period_end: params.cancel_at_period_end === true };
      return subs[id]!;
    },
    async cancel(id) {
      cancelled.push(id);
    },
  },
  checkout: {
    sessions: {
      async create(params) {
        created.push(params);
        return { url: "https://checkout.stripe.test/s1" };
      },
      async retrieve(id) {
        const s = sessions[id];
        if (!s) throw new Error("no session");
        return s;
      },
    },
  },
  billingPortal: { sessions: { create: async () => ({ url: "https://billing.stripe.test/p" }) } },
  webhooks: real.webhooks as unknown as StripeClient["webhooks"],
};

const sub = (over: Partial<StripeSub> & { id: string }): StripeSub => ({
  status: "active",
  customer: "cus_1",
  cancel_at_period_end: false,
  items: { data: [{ current_period_end: PERIOD_END }] },
  metadata: { userId },
  ...over,
});

const signed = (type: string, object: Record<string, unknown>) => {
  const payload = JSON.stringify({ id: "evt_1", object: "event", type, data: { object } });
  const header = real.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { payload, header };
};

const provider = () => createStripeProvider(db, fake);
const send = (type: string, object: Record<string, unknown>) => {
  const { payload, header } = signed(type, object);
  return provider().handleWebhook(payload, header);
};
const ent = async () => (await db.select().from(entitlements).where(eq(entitlements.userId, userId)))[0];
const eventCount = async (kind: "subscribe" | "payment_failed" | "cancel") =>
  (await db.select().from(events).where(and(eq(events.userId, userId), eq(events.kind, kind)))).length;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
});
beforeEach(async () => {
  await db.delete(entitlements);
  const [u] = await db.insert(users).values({ displayName: "t" }).returning();
  userId = u!.id;
  subs = { sub_1: sub({ id: "sub_1" }) };
  sessions = { cs_1: { client_reference_id: userId, status: "complete", subscription: "sub_1" } };
  created = [];
  updated = [];
  cancelled = [];
});

describe("① 결제 완료 반영", () => {
  it("웹훅 checkout.session.completed → paid·100·기간·stripe id", async () => {
    expect(await send("checkout.session.completed", { id: "cs_1", subscription: "sub_1", client_reference_id: userId, customer: "cus_1" })).toEqual({ handled: true });
    const e = (await ent())!;
    expect(e.plan).toBe("paid");
    expect(e.dailyQuota).toBe(100);
    expect(e.currentPeriodEnd!.getTime()).toBe(PERIOD_END * 1000);
    expect([e.stripeCustomerId, e.stripeSubscriptionId, e.stripeStatus]).toEqual(["cus_1", "sub_1", "active"]);
  });

  it("복귀 페이지(applyCheckoutSession) → 같은 결과", async () => {
    expect(await applyCheckoutSession(db, "cs_1", userId, fake)).toBe(true);
    const e = (await ent())!;
    expect([e.plan, e.dailyQuota, e.stripeSubscriptionId]).toEqual(["paid", 100, "sub_1"]);
    expect(e.currentPeriodEnd!.getTime()).toBe(PERIOD_END * 1000);
  });

  it("둘을 연달아 실행해도 행 1개·subscribe 이벤트 1개", async () => {
    await applyCheckoutSession(db, "cs_1", userId, fake);
    await send("checkout.session.completed", { id: "cs_1", subscription: "sub_1", client_reference_id: userId });
    await applyCheckoutSession(db, "cs_1", userId, fake);
    expect(await db.select().from(entitlements).where(eq(entitlements.userId, userId))).toHaveLength(1);
    expect(await eventCount("subscribe")).toBe(1);
  });

  it("current_period_end가 구독 최상위에만 있어도 읽는다", async () => {
    subs.sub_1 = sub({ id: "sub_1", items: undefined, current_period_end: PERIOD_END });
    await applyCheckoutSession(db, "cs_1", userId, fake);
    expect((await ent())!.currentPeriodEnd!.getTime()).toBe(PERIOD_END * 1000);
  });
});

describe("② 해지", () => {
  it("cancel → Stripe cancel_at_period_end=true 호출 + DB 반영", async () => {
    await applyCheckoutSession(db, "cs_1", userId, fake);
    await provider().cancel(userId);
    expect(updated).toEqual([{ id: "sub_1", params: { cancel_at_period_end: true } }]);
    const e = (await ent())!;
    expect([e.plan, e.cancelAtPeriodEnd]).toEqual(["paid", true]);
    expect(await eventCount("cancel")).toBe(1);
  });

  it("Portal 경로: subscription.updated(cancel_at_period_end) → DB 반영", async () => {
    await applyCheckoutSession(db, "cs_1", userId, fake);
    subs.sub_1 = sub({ id: "sub_1", cancel_at_period_end: true });
    await send("customer.subscription.updated", { id: "sub_1", customer: "cus_1" });
    expect((await ent())!.cancelAtPeriodEnd).toBe(true);
  });
});

describe("③ 웹훅 서명", () => {
  const post = async (headers: Record<string, string>, body: string) => {
    const { POST } = await import("../../src/app/api/stripe/webhook/route.js");
    return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers, body }));
  };

  it("서명이 틀리면 400이고 DB는 그대로", async () => {
    const { payload } = signed("customer.subscription.updated", { id: "sub_1", customer: "cus_1" });
    const bad = real.webhooks.generateTestHeaderString({ payload, secret: "whsec_wrong" });
    await expect(provider().handleWebhook(payload, bad)).rejects.toThrow();
    expect((await post({ "stripe-signature": bad }, payload)).status).toBe(400);
    expect(await ent()).toBeUndefined();
  });

  it("서명 헤더가 없으면 400이고 DB는 그대로", async () => {
    const { payload } = signed("customer.subscription.updated", { id: "sub_1", customer: "cus_1" });
    expect((await post({}, payload)).status).toBe(400);
    expect(await ent()).toBeUndefined();
  });
});

describe("④ past_due·결제 실패·삭제", () => {
  beforeEach(async () => {
    await applyCheckoutSession(db, "cs_1", userId, fake);
  });

  it("subscription.updated(past_due) → paid 유지·stripeStatus=past_due", async () => {
    subs.sub_1 = sub({ id: "sub_1", status: "past_due" });
    await send("customer.subscription.updated", { id: "sub_1", customer: "cus_1" });
    const e = (await ent())!;
    expect([e.plan, e.dailyQuota, e.stripeStatus]).toEqual(["paid", 100, "past_due"]);
  });

  it("invoice.payment_failed → handled·payment_failed 이벤트(신·구 API 필드 모두)", async () => {
    subs.sub_1 = sub({ id: "sub_1", status: "past_due" });
    expect(await send("invoice.payment_failed", { id: "in_1", subscription: "sub_1" })).toEqual({ handled: true });
    expect(await send("invoice.payment_failed", { id: "in_2", parent: { subscription_details: { subscription: "sub_1" } } })).toEqual({ handled: true });
    expect(await eventCount("payment_failed")).toBe(2);
    expect((await ent())!.stripeStatus).toBe("past_due");
  });

  it("subscription.deleted → free·한도 5", async () => {
    subs.sub_1 = sub({ id: "sub_1", status: "canceled" });
    await send("customer.subscription.deleted", { id: "sub_1", customer: "cus_1" });
    const e = (await ent())!;
    expect([e.plan, e.dailyQuota, e.cancelAtPeriodEnd, e.stripeStatus]).toEqual(["free", 5, false, "canceled"]);
  });

  it("모르는 이벤트는 handled:false", async () => {
    expect(await send("customer.created", { id: "cus_1" })).toEqual({ handled: false });
  });
});

describe("⑧ 방어", () => {
  it("paid 사용자의 createCheckout은 새 세션 없이 /settings", async () => {
    await applyCheckoutSession(db, "cs_1", userId, fake);
    expect(await provider().createCheckout(userId)).toEqual({ url: "/settings" });
    expect(created).toHaveLength(0);
  });

  it("free 사용자의 createCheckout은 Checkout Session 생성(USD 1000 월 반복·userId 표식)", async () => {
    expect(await provider().createCheckout(userId)).toEqual({ url: "https://checkout.stripe.test/s1" });
    const p = created[0] as Record<string, any>;
    expect(p.mode).toBe("subscription");
    expect(p.client_reference_id).toBe(userId);
    expect(p.subscription_data.metadata.userId).toBe(userId);
    expect(p.line_items[0].price_data).toMatchObject({ currency: "usd", unit_amount: 1000, recurring: { interval: "month" } });
    expect(p.customer).toBeUndefined();
    expect(p.success_url).toContain("/billing/success?session_id={CHECKOUT_SESSION_ID}");
  });

  it("해지된 사용자의 재결제는 저장된 customer를 재사용", async () => {
    await applyCheckoutSession(db, "cs_1", userId, fake);
    subs.sub_1 = sub({ id: "sub_1", status: "canceled" });
    await send("customer.subscription.deleted", { id: "sub_1", customer: "cus_1" });
    await provider().createCheckout(userId);
    expect((created[0] as Record<string, unknown>).customer).toBe("cus_1");
  });

  it("남의 session_id로 복귀하면 DB 변화 없음", async () => {
    sessions.cs_other = { client_reference_id: "00000000-0000-4000-8000-000000000000", status: "complete", subscription: "sub_1" };
    expect(await applyCheckoutSession(db, "cs_other", userId, fake)).toBe(false);
    expect(await ent()).toBeUndefined();
  });

  it("미완료 세션은 반영하지 않는다", async () => {
    sessions.cs_1 = { client_reference_id: userId, status: "open", subscription: null };
    expect(await applyCheckoutSession(db, "cs_1", userId, fake)).toBe(false);
    expect(await ent()).toBeUndefined();
  });

  it("deleted 뒤에 늦게 온 이벤트(retrieve 결과 canceled)는 free를 유지", async () => {
    await applyCheckoutSession(db, "cs_1", userId, fake);
    subs.sub_1 = sub({ id: "sub_1", status: "canceled" });
    await send("customer.subscription.deleted", { id: "sub_1", customer: "cus_1" });
    await send("customer.subscription.updated", { id: "sub_1", customer: "cus_1" });
    await send("checkout.session.completed", { id: "cs_1", subscription: "sub_1", client_reference_id: userId });
    expect((await ent())!.plan).toBe("free");
  });

  it("저장된 것과 다른(옛) 구독의 강등은 무시", async () => {
    await applyCheckoutSession(db, "cs_1", userId, fake);
    subs.sub_old = sub({ id: "sub_old", status: "canceled" });
    expect(await send("customer.subscription.deleted", { id: "sub_old", customer: "cus_1" })).toEqual({ handled: false });
    const e = (await ent())!;
    expect([e.plan, e.stripeSubscriptionId]).toEqual(["paid", "sub_1"]);
  });

  it("없는 사용자 이벤트는 handled:false(예외 없음)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    subs.sub_ghost = sub({ id: "sub_ghost", customer: "cus_ghost", metadata: { userId: "00000000-0000-4000-8000-000000000000" } });
    expect(await send("customer.subscription.updated", { id: "sub_ghost", customer: "cus_ghost" })).toEqual({ handled: false });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("metadata가 없으면 저장된 stripeSubscriptionId로 사용자를 찾는다", async () => {
    await applyCheckoutSession(db, "cs_1", userId, fake);
    subs.sub_1 = sub({ id: "sub_1", metadata: {}, cancel_at_period_end: true });
    await send("customer.subscription.updated", { id: "sub_1", customer: "cus_1" });
    expect((await ent())!.cancelAtPeriodEnd).toBe(true);
  });
});

describe("cancelSubscriptionNow·provider 선택", () => {
  it("구독이 있으면 즉시 취소, 없으면 no-op", async () => {
    await cancelSubscriptionNow(db, userId, fake);
    expect(cancelled).toEqual([]);
    await applyCheckoutSession(db, "cs_1", userId, fake);
    await cancelSubscriptionNow(db, userId, fake);
    expect(cancelled).toEqual(["sub_1"]);
  });

  it("STRIPE_SECRET_KEY가 있으면 dev에서도 Stripe, 프로덕션에서 키가 없으면 호출 시 미설정 오류", async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      await expect(getBillingProvider(db, { NODE_ENV: "production" }).createCheckout(userId)).rejects.toThrow("Stripe 미설정");
      expect(await getBillingProvider(db, { NODE_ENV: "development" }).createCheckout(userId)).toEqual({ url: "/billing/mock-checkout" });
      await expect(getBillingProvider(db, { NODE_ENV: "development", STRIPE_SECRET_KEY: "sk_test_x" }).handleWebhook("{}", "x")).rejects.toThrow();
    } finally {
      if (saved) process.env.STRIPE_SECRET_KEY = saved;
    }
  });
});
