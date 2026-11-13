// 공백일 감쇠(따라잡기 규칙). 순수 함수. 별도 생성 없이 선톡 상한만 줄인다(전체구조 §2.3).
const DAY_MS = 86400000;

/** 마지막 사용자 접촉(없으면 관계 시작) 이후 지난 날수(내림). */
export function silenceDays(now: Date, lastUserAt: Date | null, startedAt: Date): number {
  const last = lastUserAt ?? startedAt;
  return Math.max(0, Math.floor((now.getTime() - last.getTime()) / DAY_MS));
}

/** 하루 선톡 상한: 0~1일 정상 · 2~3일 절반(최소 1) · 4일+ 하루 1회. */
export function decayCap(base: number, silent: number): number {
  if (base <= 0) return 0;
  if (silent <= 1) return base;
  if (silent <= 3) return Math.max(1, Math.floor(base / 2));
  return 1;
}
