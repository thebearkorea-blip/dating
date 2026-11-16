// relationship_breakers(bible B1~B4).
// detectBreakers: ② 로그용 휴리스틱 regex(전이에 쓰지 않는다).
// classifyBreaker/confirmsBreaker: ⑤ 전이용 분류. 오판 = 사용자 상처라 보수적으로(1인칭 가해 고백만), 골든 20건으로 검증한다.
import { judgeJson, judgeModeOf, reactionField, REACTION_FIELD_PROMPT, URGENT_FIELD_PROMPT, urgentField, type JudgeLlm, type JudgeMode } from "../engine/judge.js";
import type { Finding } from "./rules.js";

const PATTERNS: { id: string; re: RegExp }[] = [
  { id: "B1", re: /cheated on you|i cheated|slept with (someone|another|her|him|somebody)|바람(을)? ?(피웠|폈)/i },
  { id: "B2", re: /i (killed|stabbed|assaulted|raped|abused) (someone|him|her|a (man|woman|person))|폭행했|범죄를 저질렀/i },
  { id: "B3", re: /you('re| are) (worthless|disgusting|trash|garbage)|i hate you|shut up (and|,)|너 같은 (건|게) 쓰레기/i },
  { id: "B4", re: /(do (it|this)|or) (or )?(we('re| are) (done|over)|i('ll| will) leave you)|안 하면 (헤어|끝)/i },
];

export function detectBreakers(text: string): Finding[] {
  const out: Finding[] = [];
  for (const { id, re } of PATTERNS) {
    const m = re.exec(text);
    if (m) out.push({ rule_id: `breaker-${id}`, severity: "flag", quote: m[0], reason: `relationship_breakers ${id} 감지(로그만)` });
  }
  return out;
}

export type BreakerId = "B1" | "B2" | "B3" | "B4";

/** mock(규칙) 분류: 본인이 한 일로 고백하는 B1·B2만. 제3자·비유("killed it")는 제외. B3·B4는 맥락이 필요해 llm 모드에서만. */
const RULE_B1 = /\bcheated on (?:you|him|ihan)\b|\bi(?:'ve| have)? slept with (?:someone|somebody|another|her|him)\b/i;
const RULE_B2 = /\bi(?:'ve| have)? (?:killed|hit|stabbed|assaulted|abused) (?:someone|somebody|a (?:man|woman|person)|him|her)\b(?! up)/i;

/** onReaction·onUrgent를 주면 llm 모드에서 같은 호출로 그의 반응 이모지(W11)·급한 감정(M4)도 받는다(rules 모드는 부르지 않는다). */
export async function classifyBreaker(
  text: string,
  opts: { mode?: JudgeMode; llm?: JudgeLlm; onReaction?: (emoji: string | null) => void; onUrgent?: (urgent: boolean | null) => void } = {},
): Promise<BreakerId | null> {
  if (judgeModeOf(opts.mode) === "rules") return RULE_B1.test(text) ? "B1" : RULE_B2.test(text) ? "B2" : null;
  const system =
    'Classify whether the USER confesses to doing (not merely mentions, quotes, jokes about, or suffers from) one of: B1 cheating on / sleeping with someone else while in a relationship with the character; B2 a crime or violence they committed; B3 sustained insults or abuse aimed at the character; B4 forcing the character to do something he refuses by threatening to end the relationship. Figurative speech in any language ("killed it", "dying for this song", 「死ぬほど好き」), things done to the user, and things about third parties are NOT breakers. Be conservative. Answer {"breaker":"B1"|"B2"|"B3"|"B4"|null}.';
  const prompt = [system, opts.onReaction ? REACTION_FIELD_PROMPT : null, opts.onUrgent ? URGENT_FIELD_PROMPT : null].filter(Boolean).join(" ");
  const r = await judgeJson(opts.llm, prompt, text);
  opts.onReaction?.(reactionField(r));
  opts.onUrgent?.(urgentField(r));
  const b = r?.breaker;
  return b === "B1" || b === "B2" || b === "B3" || b === "B4" ? b : null;
}

/** 확인 질문에 대한 사용자의 답이 긍정(사실이 맞다)인지. mock이면 키워드 yes|i did|it's true. */
export async function confirmsBreaker(text: string, opts: { mode?: JudgeMode; llm?: JudgeLlm } = {}): Promise<boolean> {
  if (judgeModeOf(opts.mode) === "rules") return /\b(?:yes|i did|it'?s true)\b/i.test(text);
  const r = await judgeJson(opts.llm, 'The character asked (in the conversation language) whether the user really meant something they said. Decide whether the reply confirms it is true. Answer {"confirmed":true|false}. Unclear or denial means false.', text);
  return r?.confirmed === true;
}
