// TODO(Stripe): 심사 통과 후 구현한다. 키·패키지가 없어 지금은 스텁만 둔다.
// - createCheckout: Checkout Session 생성(가격 $10 / month) 후 url 반환
// - handleWebhook: 서명 검증 후 entitlements(plan·daily_quota·current_period_end·cancel_at_period_end) 갱신
// - cancel: cancel_at_period_end=true로 구독 갱신
import type { BillingProvider } from "./provider.js";

export const stripeProvider: BillingProvider = {
  async createCheckout() {
    throw new Error("Stripe 미구현");
  },
  async handleWebhook() {
    throw new Error("Stripe 미구현");
  },
  async cancel() {
    throw new Error("Stripe 미구현");
  },
};
