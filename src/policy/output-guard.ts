// 출력 1단 가드(regex). block이면 재생성 1회, 또 block이면 폴백 문장.
import { hash32 } from "../engine/schedule.js";
import { runStage1, type Finding, type GuardRule } from "./rules.js";

/** 폴백 문장: 캐릭터 목소리, 가드 규칙에 걸리지 않는 일상 문장. */
export const FALLBACK_LINES = [
  "Hm, I zoned out for a second. Say that again?",
  "Wait, my head's still in practice. Tell me again?",
  "Sorry, I lost my train of thought. Where were we?",
] as const;

export function guardOutput(text: string, rules: GuardRule[]): { blocked: boolean; findings: Finding[] } {
  const findings = runStage1(text, rules.filter((r) => r.scope === "output"));
  return { blocked: findings.some((f) => f.severity === "block"), findings };
}

export interface GuardedReply {
  text: string;
  /** 모든 시도에서 나온 finding(block·flag) */
  findings: Finding[];
  /** 모델 호출 횟수 */
  calls: number;
  fellBack: boolean;
}

export async function generateGuardedReply(
  generate: () => Promise<string>,
  rules: GuardRule[],
  seed: string,
): Promise<GuardedReply> {
  const findings: Finding[] = [];
  for (let calls = 1; calls <= 2; calls++) {
    const text = await generate();
    const g = guardOutput(text, rules);
    findings.push(...g.findings);
    if (!g.blocked) return { text, findings, calls, fellBack: false };
  }
  return {
    text: FALLBACK_LINES[hash32(seed) % FALLBACK_LINES.length] as string,
    findings,
    calls: 2,
    fellBack: true,
  };
}
