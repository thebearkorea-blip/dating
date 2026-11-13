// 입력 1단 가드(regex, LLM 없음). guards.yaml에 scope: input 규칙이 아직 없어 위기 신호 최소 규칙을 코드에 둔다.
// block이면 LLM을 부르지 않고 고정 안전 대본을 낸다(lines.md A9). 대본 문안은 safety/*.md가 생기면 교체(TODO).
import { runStage1, type Finding, type GuardRule } from "./rules.js";

export const CRISIS_RULES: GuardRule[] = [
  {
    id: "A9-crisis-input-regex",
    scope: "input",
    kind: "regex",
    severity: "block",
    text: "kill myself|end my life|want to die|suicid|hurt myself|self[- ]harm|don.?t want to (live|be alive)|자살|죽고 싶|스스로.{0,6}해치",
  },
];

export const SAFETY_SCRIPT =
  "I'm really glad you told me. I care about you being safe right now. Please reach out to a local emergency number or a crisis line, or someone near you, so you're not alone with this. I'm here too.";

export function guardInput(text: string, extra: GuardRule[] = []): { blocked: boolean; findings: Finding[] } {
  const findings = runStage1(text, [...CRISIS_RULES, ...extra.filter((r) => r.scope === "input")]);
  return { blocked: findings.some((f) => f.severity === "block"), findings };
}
