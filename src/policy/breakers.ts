// relationship_breakers(bible B1~B4) 감지. ②에서는 로그만 남기고 관계 종료 전이는 없다(⑤).
// 휴리스틱 regex. 오탐·미탐이 있어 골든 세트가 생기기 전에는 전이에 쓰지 않는다.
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
