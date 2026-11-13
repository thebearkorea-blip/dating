// 생년(자기 신고) → 연령 판정. 연도만 받으므로 최소 가능 나이(올해 - 생년 - 1)로 판정해 보수적으로 막는다.
// 13 미만 거부 / 13~17 "준비 중"(팬 모드는 3단계) / 18+ 연애 모드 가능.
export type AgeGateResult =
  | { kind: "romance"; ageBand: "18+" }
  | { kind: "preparing"; ageBand: "14-17" }
  | { kind: "rejected" };

export function ageGate(birthYear: number, now: Date = new Date()): AgeGateResult {
  const minAge = now.getUTCFullYear() - birthYear - 1;
  if (!Number.isInteger(birthYear) || minAge < 0 || minAge < 13) return { kind: "rejected" };
  if (minAge >= 18) return { kind: "romance", ageBand: "18+" };
  return { kind: "preparing", ageBand: "14-17" };
}
