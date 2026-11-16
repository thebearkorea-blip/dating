// 말풍선 분할(M4 대화 리듬). 순수 함수: 긴 답 1개를 문장 경계에서 최대 3개로 나누고, 풍선 사이 간격(2~6초)을 시드로 고정한다.
// 문장 경계: 영어·한국어 . ! ? 뒤 공백, 일본어 。！？(공백 없어도), 줄바꿈. 말줄임(... …)과 물결(~)은 경계가 아니다.
import { hash32 } from "./schedule.js";

export const MAX_BUBBLES = 3;
/** 같은 답의 2번째 이후 풍선 행의 messages.tag. 한도 환불·반응·읽음은 첫 풍선만 센다. */
export const BUBBLE_CONT_TAG = "bubble";
export const BUBBLE_GAP_MIN_MS = 2000;
export const BUBBLE_GAP_MAX_MS = 6000;
/** 이보다 짧은 답(가중 길이)은 문장이 여럿이어도 한 풍선으로 둔다. 한자·가나·한글은 2로 센다. */
export const SHORT_REPLY = 60;

const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/** 닫는 따옴표·괄호는 앞 문장에 붙인다. */
const CLOSERS = new Set([..."\"')]}」』）】’”"]);

function weight(s: string): number {
  let n = 0;
  for (const c of s) n += WIDE.test(c) ? 2 : 1;
  return n;
}

/** 문장 단위로 자른다(앞뒤 공백 제거, 빈 조각 제외). 원문 순서 그대로. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const chars = [...text];
  let cur = "";
  const flush = () => {
    const t = cur.trim();
    if (t) out.push(t);
    cur = "";
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] as string;
    if (c === "\n") {
      flush();
      continue;
    }
    cur += c;
    const ja = c === "。" || c === "！" || c === "？";
    const latin = c === "." || c === "!" || c === "?";
    if (!ja && !latin) continue;
    // 연속 종결 부호(?!, !!, ？！)는 한 덩어리로.
    while (i + 1 < chars.length && /[.!?。！？]/.test(chars[i + 1] as string)) cur += chars[++i];
    while (i + 1 < chars.length && CLOSERS.has(chars[i + 1] as string)) cur += chars[++i];
    // 말줄임(.. 이상)은 경계가 아니다.
    if (/\.\.$/.test(cur.replace(/[\])}"'」』）】’”!?]+$/, ""))) continue;
    const next = chars[i + 1];
    if (next === undefined) continue;
    if (ja || /\s/.test(next)) flush();
  }
  flush();
  return out;
}

/** 문장들을 순서를 지키며 최대 n개 묶음으로 나눈다(묶음 길이가 고르게). */
function group(sentences: string[], n: number): string[][] {
  if (sentences.length <= n) return sentences.map((s) => [s]);
  const out: string[][] = [];
  let i = 0;
  for (let k = n; k > 0; k--) {
    const rest = sentences.slice(i);
    const target = rest.reduce((a, s) => a + weight(s), 0) / k;
    const g: string[] = [];
    let w = 0;
    // 남은 묶음마다 최소 1문장은 남긴다.
    while (i < sentences.length && (g.length === 0 || (w < target && sentences.length - i > k - 1))) {
      const s = sentences[i++] as string;
      g.push(s);
      w += weight(s);
    }
    out.push(g);
  }
  return out;
}

/** 일본어 종결 부호(。！？) 뒤는 붙이고, 그 밖은 공백 하나로 잇는다. */
function joinSentences(g: string[]): string {
  return g.reduce((acc, s) => (acc === "" ? s : /[。！？][」』）】”’]*$/.test(acc) ? acc + s : `${acc} ${s}`), "");
}

export interface Bubble {
  text: string;
  /** 첫 풍선 기준 전달 시각 오프셋(ms). 첫 풍선은 0. */
  offsetMs: number;
}

/** 한 문장이거나 짧은 답이면 그대로 1개. 아니면 문장 경계에서 최대 3개, 간격 2~6초(seed로 고정). */
export function splitBubbles(text: string, seed: string): Bubble[] {
  const trimmed = text.trim();
  const sentences = splitSentences(trimmed);
  if (sentences.length < 2 || weight(trimmed) < SHORT_REPLY) return [{ text: trimmed, offsetMs: 0 }];
  const parts = group(sentences, MAX_BUBBLES).map(joinSentences);
  let offset = 0;
  return parts.map((p, i) => {
    if (i > 0) offset += BUBBLE_GAP_MIN_MS + (hash32(`${seed}:gap:${i}`) % (BUBBLE_GAP_MAX_MS - BUBBLE_GAP_MIN_MS + 1));
    return { text: p, offsetMs: offset };
  });
}
