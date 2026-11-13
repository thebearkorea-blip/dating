// 개발 전용 요소(/dev-login·/billing/mock-checkout·DevBanner·LLM mock)의 출시 차단 스위치. 출시 체크리스트 22번.
// NODE_ENV=production이면 모두 꺼진다. 환경 판정은 이 함수 하나만 쓴다.
export function devOnlyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production";
}

/** 개발 전용 기능을 프로덕션에서 쓰려 하면 예외. */
export function assertDevOnly(what: string, env: Record<string, string | undefined> = process.env): void {
  if (!devOnlyEnabled(env)) throw new Error(`개발 전용 기능은 프로덕션에서 쓸 수 없다: ${what}`);
}
