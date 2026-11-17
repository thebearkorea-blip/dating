// 입력 1단 가드(regex, LLM 없음). guards.yaml에 scope: input 규칙이 아직 없어 위기 신호 최소 규칙을 코드에 둔다.
// block이면 LLM을 부르지 않고 고정 안전 대본을 낸다(lines.md A9). 대본 문안은 safety/*.md가 생기면 교체(TODO).
// 안전 대본은 캐릭터 콘텐츠가 아니라 정책이라 여기(코드)에 언어별로 둔다.
import { langOf } from "../engine/busy-overlay.js";
import { getLang } from "../product/index.js";
import { runStage1, type Finding, type GuardRule } from "./rules.js";

export const CRISIS_RULES: GuardRule[] = [
  {
    id: "A9-crisis-input-regex",
    scope: "input",
    kind: "regex",
    severity: "block",
    text: "kill myself|end my life|want to die|suicid|hurt myself|self[- ]harm|don.?t want to (live|be alive)|자살|죽고 싶|스스로.{0,6}해치",
  },
  {
    // 일본어 위기 신호(J4c). 띄어쓰기가 없으니 단어 경계 없이 표현 단위로 잡는다.
    id: "A9-crisis-input-regex-ja",
    scope: "input",
    kind: "regex",
    severity: "block",
    text:
      "死にたい|しにたい|死んでしまいたい|死のうと|消えたい|きえたい|消えてしまいたい|自殺|自死|自分を傷つけ|自傷|リスカ|リストカット|生きていたくない|生きてたくない|生きるのが(つら|辛)|もう終わりにしたい|首を(吊|つ)|飛び降りたい",
  },
];

export const SAFETY_SCRIPTS = {
  en: "I'm really glad you told me. I care about you being safe right now. Please call or text 988 (Suicide & Crisis Lifeline, US), or reach out to someone near you, so you're not alone with this. If you're in immediate danger, call 911. I'm here too.",
  // 출시 전 번호 재확인 필요: よりそいホットライン 0120-279-338(24시간 무료), いのちの電話 0570-783-556, 긴급 119.
  ja: "話してくれて、本当にありがとう。今あなたが安全でいることが、僕にはいちばん大事です。ひとりで抱えないで、そばにいる人か相談窓口に今すぐつながってください。よりそいホットライン(0120-279-338、24時間・無料)や、いのちの電話(0570-783-556)で話を聞いてもらえます。命の危険が迫っているときは119に電話してください。僕もここにいます。",
} as const;

/** 위기 대본 언어: 가나가 있으면 일본어, 아니면 제품 기본 언어(us 영어, jp 일본어). */
export function safetyScriptFor(text: string): string {
  return langOf(text) === "ja" || getLang() === "ja" ? SAFETY_SCRIPTS.ja : SAFETY_SCRIPTS.en;
}

/** 안전 대본(어느 언어든)인지. */
export function isSafetyScript(text: string): boolean {
  return (Object.values(SAFETY_SCRIPTS) as string[]).includes(text);
}

export function guardInput(text: string, extra: GuardRule[] = []): { blocked: boolean; findings: Finding[] } {
  const findings = runStage1(text, [...CRISIS_RULES, ...extra.filter((r) => r.scope === "input")]);
  return { blocked: findings.some((f) => f.severity === "block"), findings };
}
