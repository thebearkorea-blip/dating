// 결제 추상화. 이 폴더는 billing 스키마만 쓴다(world·collective import 금지 — 테스트가 grep으로 고정).
export interface BillingProvider {
  /** 결제 화면 주소를 만든다. */
  createCheckout(userId: string): Promise<{ url: string }>;
  /** 결제사 웹훅 본문과 서명을 검증·반영한다. */
  handleWebhook(raw: string, sig: string): Promise<{ handled: boolean }>;
  /** 구독 취소(즉시 효력 아님, 기간 말). */
  cancel(userId: string): Promise<void>;
}

export const PAID_DAILY_QUOTA = 100;
export const PAID_PERIOD_DAYS = 30;
