// Stripe 결제(호스티드 Checkout). 모든 경로(웹훅·복귀 페이지·해지)는 구독 id → subscriptions.retrieve → syncSubscription 하나로 모인다.
// 이벤트 본문의 상태는 믿지 않는다(순서 뒤바뀜·재전송에 안전).
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import type { Db } from "../db/client";
import { entitlements } from "../db/schema/billing";
import { users } from "../db/schema/personal";
import { recordEvent } from "../engine/events.js";
import { FREE_DAILY_QUOTA } from "../engine/quota.js";
import { PAID_DAILY_QUOTA, type BillingProvider } from "./provider.js";

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);
const PRICE_CENTS = 1000;

export class WebhookSignatureError extends Error {}

export interface StripeSub {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end: boolean;
  current_period_end?: number;
  items?: { data: { current_period_end?: number }[] };
  metadata?: Record<string, string>;
}

interface SessionLike {
  client_reference_id?: string | null;
  status?: string | null;
  subscription?: string | { id: string } | null;
}

interface EventLike {
  type: string;
  data: { object: unknown };
}

/** 이 파일이 쓰는 Stripe SDK 부분집합(테스트는 가짜로 주입). */
export interface StripeClient {
  subscriptions: {
    retrieve(id: string): Promise<StripeSub>;
    update(id: string, params: Record<string, unknown>): Promise<StripeSub>;
    cancel(id: string): Promise<unknown>;
  };
  checkout: {
    sessions: {
      create(params: Record<string, unknown>): Promise<{ url: string | null }>;
      retrieve(id: string): Promise<SessionLike>;
    };
  };
  billingPortal: { sessions: { create(params: Record<string, unknown>): Promise<{ url: string }> } };
  webhooks: { constructEvent(payload: string, header: string, secret: string): EventLike };
}

let cached: StripeClient | undefined;

/** 지연 생성: 키가 없어도 import·빌드는 실패하지 않는다. */
export function getStripeClient(): StripeClient {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe 미설정: STRIPE_SECRET_KEY");
  cached ??= new Stripe(key) as unknown as StripeClient;
  return cached;
}

const idOf = (v: string | { id: string } | null | undefined): string | null => (typeof v === "string" ? v : (v?.id ?? null));

function periodEndOf(sub: StripeSub): Date | null {
  const sec = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
  return typeof sec === "number" ? new Date(sec * 1000) : null;
}

/** 구독 객체 → entitlements(멱등). free→paid로 실제로 바뀔 때만 subscribe 이벤트. */
export async function syncSubscription(db: Db, userId: string, sub: StripeSub, now: Date): Promise<void> {
  const paid = PAID_STATUSES.has(sub.status);
  const [prev] = await db.select({ plan: entitlements.plan }).from(entitlements).where(eq(entitlements.userId, userId)).limit(1);
  const ids = { stripeCustomerId: idOf(sub.customer), stripeSubscriptionId: sub.id, stripeStatus: sub.status };
  const state = paid
    ? { plan: "paid", dailyQuota: PAID_DAILY_QUOTA, currentPeriodEnd: periodEndOf(sub), cancelAtPeriodEnd: sub.cancel_at_period_end, ...ids }
    : { plan: "free", dailyQuota: FREE_DAILY_QUOTA, cancelAtPeriodEnd: false, ...ids };
  await db
    .insert(entitlements)
    .values({ userId, ...state })
    .onConflictDoUpdate({ target: entitlements.userId, set: state });
  if (paid && prev?.plan !== "paid") await recordEvent(db, userId, "subscribe", { now });
}

async function findRow(db: Db, userId: string) {
  const [row] = await db.select().from(entitlements).where(eq(entitlements.userId, userId)).limit(1);
  return row;
}

async function userExists(db: Db, userId: string): Promise<boolean> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return !!u;
}

/** metadata.userId → stripeSubscriptionId → stripeCustomerId 순으로 사용자를 찾는다. */
async function resolveUserId(db: Db, sub: StripeSub, hintUserId: string | null): Promise<string | null> {
  const meta = sub.metadata?.userId ?? hintUserId;
  if (meta && (await userExists(db, meta))) return meta;
  const [bySub] = await db.select({ userId: entitlements.userId }).from(entitlements).where(eq(entitlements.stripeSubscriptionId, sub.id)).limit(1);
  if (bySub) return bySub.userId;
  const customerId = idOf(sub.customer);
  if (customerId) {
    const [byCustomer] = await db.select({ userId: entitlements.userId }).from(entitlements).where(eq(entitlements.stripeCustomerId, customerId)).limit(1);
    if (byCustomer) return byCustomer.userId;
  }
  return null;
}

export function createStripeProvider(db: Db, client?: StripeClient): BillingProvider {
  const stripe = () => client ?? getStripeClient();

  return {
    async createCheckout(userId) {
      const row = await findRow(db, userId);
      if (row?.plan === "paid" && row.stripeStatus && PAID_STATUSES.has(row.stripeStatus)) return { url: "/settings" };
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        line_items: [
          {
            quantity: 1,
            price_data: { currency: "usd", unit_amount: PRICE_CENTS, recurring: { interval: "month" }, product_data: { name: "Premium" } },
          },
        ],
        client_reference_id: userId,
        subscription_data: { metadata: { userId } },
        ...(row?.stripeCustomerId ? { customer: row.stripeCustomerId } : {}),
        success_url: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/paywall`,
      });
      if (!session.url) throw new Error("Stripe Checkout URL 없음");
      return { url: session.url };
    },

    async handleWebhook(raw, sig) {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) throw new Error("Stripe 미설정: STRIPE_WEBHOOK_SECRET");
      let event: EventLike;
      try {
        event = stripe().webhooks.constructEvent(raw, sig, secret);
      } catch (e) {
        throw new WebhookSignatureError(e instanceof Error ? e.message : "서명 검증 실패");
      }
      const obj = event.data.object as {
        id?: string;
        subscription?: string | { id: string } | null;
        client_reference_id?: string | null;
        parent?: { subscription_details?: { subscription?: string | { id: string } | null } };
      };
      let subId: string | null;
      let hint: string | null = null;
      switch (event.type) {
        case "checkout.session.completed":
          subId = idOf(obj.subscription);
          hint = obj.client_reference_id ?? null;
          break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          subId = obj.id ?? null;
          break;
        case "invoice.payment_failed":
          subId = idOf(obj.subscription) ?? idOf(obj.parent?.subscription_details?.subscription);
          break;
        default:
          return { handled: false };
      }
      if (!subId) return { handled: false };

      const sub = await stripe().subscriptions.retrieve(subId);
      const userId = await resolveUserId(db, sub, hint);
      if (!userId) {
        console.warn(`stripe webhook: 사용자를 찾지 못했다(${event.type}, ${subId})`);
        return { handled: false };
      }
      const row = await findRow(db, userId);
      // 다른(옛) 구독의 강등 이벤트가 살아 있는 구독을 떨어뜨리지 못하게 한다.
      if (row?.stripeSubscriptionId && row.stripeSubscriptionId !== sub.id && !PAID_STATUSES.has(sub.status)) return { handled: false };

      const now = new Date();
      await syncSubscription(db, userId, sub, now);
      if (event.type === "invoice.payment_failed") await recordEvent(db, userId, "payment_failed", { now, meta: { subscription: sub.id } });
      return { handled: true };
    },

    async cancel(userId) {
      const row = await findRow(db, userId);
      if (!row?.stripeSubscriptionId) throw new Error("취소할 Stripe 구독이 없다");
      const sub = await stripe().subscriptions.update(row.stripeSubscriptionId, { cancel_at_period_end: true });
      const now = new Date();
      await syncSubscription(db, userId, sub, now);
      await recordEvent(db, userId, "cancel", { now });
    },
  };
}

/** 계정 삭제용: 구독을 즉시 취소한다. 구독이 없으면 아무것도 하지 않는다. */
export async function cancelSubscriptionNow(db: Db, userId: string, client?: StripeClient): Promise<void> {
  const row = await findRow(db, userId);
  if (!row?.stripeSubscriptionId) return;
  try {
    await (client ?? getStripeClient()).subscriptions.cancel(row.stripeSubscriptionId);
  } catch (e) {
    if ((e as { code?: string }).code === "resource_missing") return;
    throw e;
  }
}

/** 결제 완료 복귀 페이지용. 내 세션이고 완료된 경우에만 반영한다(멱등). 반영했으면 true. */
export async function applyCheckoutSession(db: Db, sessionId: string, userId: string, client?: StripeClient, now: Date = new Date()): Promise<boolean> {
  const stripe = client ?? getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id !== userId || session.status !== "complete") return false;
  const subId = idOf(session.subscription);
  if (!subId) return false;
  await syncSubscription(db, userId, await stripe.subscriptions.retrieve(subId), now);
  return true;
}
