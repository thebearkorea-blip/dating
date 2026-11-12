// 규칙 기반 캐논 검사(LLM 없음). 휴리스틱이므로 "의심 지점"을 돌려줄 뿐 판정은 W2 2단 검수가 한다.
import type { Bible, CanonRow, Group } from "../content/schemas/index.js";

export type FindingKind = "contradiction" | "unknown_past" | "knows_nothing";

export interface Finding {
  kind: FindingKind;
  quote: string;
}

export interface CanonCheckInput {
  text: string;
  canon: CanonRow[];
  bible: Bible;
  /** 있으면 멤버 한글·영문 이름도 알려진 이름으로 본다 */
  group?: Group;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number | string): string => String(n).padStart(2, "0");

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+(?=[^\d])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 문장 속 날짜를 "MM-DD"로 */
function extractDates(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/\d{4}-(\d{2})-(\d{2})/g)) out.push(`${m[1]}-${m[2]}`);
  for (const m of s.matchAll(/(\d{1,2})월\s*(\d{1,2})일/g)) out.push(`${pad(m[1] as string)}-${pad(m[2] as string)}`);
  for (const m of s.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/gi)) {
    out.push(`${pad(MONTHS.indexOf((m[1] as string).toLowerCase()) + 1)}-${pad(m[2] as string)}`);
  }
  return out;
}

function words(s: string): string[] {
  return [...new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2))];
}

function dateContradictions(text: string, canon: CanonRow[]): Finding[] {
  const out: Finding[] = [];
  for (const sent of splitSentences(text)) {
    const dates = extractDates(sent);
    if (dates.length === 0) continue;
    const low = sent.toLowerCase();
    for (const row of canon) {
      const overlap = words(row.fact).filter((w) => low.includes(w));
      if (overlap.length < 2) continue;
      const canonDate = row.at.slice(5, 10);
      if (dates.some((d) => d !== canonDate)) {
        out.push({ kind: "contradiction", quote: sent });
        break;
      }
    }
  }
  return out;
}

const KO_NOT_NAMES = new Set(["모두", "전원", "다들", "하나", "누구", "각자", "전부", "중에"]);

function nameTable(bible: Bible, group?: Group): Map<string, string[]> {
  const t = new Map<string, string[]>();
  for (const m of bible.members) t.set(m.id, [m.id]);
  t.set(bible.id, [bible.id, bible.name.toLowerCase()]);
  for (const m of group?.members ?? []) {
    const names = [m.id, m.name.toLowerCase(), m.name_en.toLowerCase()];
    t.set(m.id, [...new Set([...(t.get(m.id) ?? []), ...names])]);
  }
  return t;
}

function memberContradictions(text: string, bible: Bible, group?: Group): Finding[] {
  const out: Finding[] = [];
  const table = nameTable(bible, group);
  const known = new Set([...table.values()].flat());
  const idOf = (name: string): string | undefined => {
    const n = name.toLowerCase();
    for (const [id, names] of table) if (names.includes(n)) return id;
    return undefined;
  };

  // 1) "member X" 의 X가 모르는 이름
  for (const m of text.matchAll(/\b(?:member|bandmate|leader|maknae)\s+([A-Z][a-z]+)\b/g)) {
    if (!known.has((m[1] as string).toLowerCase())) out.push({ kind: "contradiction", quote: m[0] });
  }
  for (const m of text.matchAll(/(?:멤버|리더|막내)\s+([가-힣]{2})(?=[\s는은이가을를,.]|$)/g)) {
    const n = m[1] as string;
    if (!KO_NOT_NAMES.has(n) && !known.has(n)) out.push({ kind: "contradiction", quote: m[0] });
  }

  // 2) 역할 불일치: 리더 = dohyun, 막내 = jihu (bible.members 관계 서술 기준)
  const roleOwner: Record<string, string | undefined> = {
    leader: bible.members.find((m) => m.relation.includes("리더"))?.id,
    maknae: bible.members.find((m) => m.relation.includes("막내"))?.id,
  };
  const roleRes: [RegExp, "leader" | "maknae", number][] = [
    [/\b([A-Za-z]+)\s+(?:is|was)\s+(?:the\s+|our\s+)?(leader|maknae)\b/gi, "leader", 1],
    [/\b(?:leader|maknae)\s+(?:is|was)\s+([A-Za-z]+)\b/gi, "leader", 1],
    [/([가-힣]{2})(?:은|는|이|가)\s*(?:우리\s*)?(리더|막내)/g, "leader", 1],
  ];
  for (const [re, , g] of roleRes) {
    for (const m of text.matchAll(re)) {
      const role = /leader|리더/i.test(m[0]) ? "leader" : "maknae";
      const id = idOf(m[g] as string);
      const owner = roleOwner[role];
      if (id && owner && id !== owner) out.push({ kind: "contradiction", quote: m[0] });
    }
  }
  return out;
}

const PAST_DEBUT: RegExp[] = [
  /데뷔(?:했|한\s*지|하고\s*나서|한\s*뒤|한\s*후)/,
  /작년에\s*데뷔/,
  /\bdebuted\b/i,
  /\b(?:since|after)\s+(?:we|our)\s+debut(?:ed)?\b/i,
  /\b(?:last year|years? ago)\b.{0,30}\bdebut/i,
];

function unknownPast(text: string): Finding[] {
  const out: Finding[] = [];
  for (const sent of splitSentences(text)) {
    if (PAST_DEBUT.some((re) => re.test(sent))) out.push({ kind: "unknown_past", quote: sent });
  }
  return out;
}

/** 첫 절의 단어 중 너무 일반적인 것은 주제어에서 뺀다. 커피는 믹스커피파라서 뺀다. */
const TOPIC_STOP = new Set(["종류", "최신", "구체", "디테일", "생활", "경험", "경험의", "커피", "명확히", "끝까지", "사용자를"]);
const TOPIC_ALIASES: Record<string, RegExp[]> = {
  해외: [/\boverseas\b/i, /\bliving abroad\b/i, /\bstudied abroad\b/i],
  와인: [/\bwine\b/i],
  게임: [/\bvideo ?games?\b/i, /\bgaming\b/i],
  연애: [/\bwhen i (?:was )?dating\b/i, /\bmy ex\b/i],
  투자: [/\binvest(?:ing|ment|ments)?\b/i],
  주식: [/\bstocks?\b/i, /\bshares market\b/i],
  부동산: [/\breal estate\b/i],
  영어권: [/\bamerican culture\b/i, /\bwestern culture\b/i],
  골랐는지: [/(?:chose|picked) you because/i, /너를 골랐/],
};

function topicTerms(bible: Bible): string[] {
  const terms: string[] = [];
  for (const entry of bible.knows_nothing_about) {
    const first = entry.split(/[.,]/)[0] ?? "";
    for (const w of first.split(/[·\s]+/)) {
      if (w.length >= 2 && !TOPIC_STOP.has(w)) terms.push(w);
    }
  }
  return [...new Set(terms)];
}

function knowsNothing(text: string, bible: Bible): Finding[] {
  const out: Finding[] = [];
  const terms = topicTerms(bible);
  for (const sent of splitSentences(text)) {
    const hit = terms.some(
      (t) => sent.includes(t) || (TOPIC_ALIASES[t] ?? []).some((re) => re.test(sent)),
    );
    if (hit) out.push({ kind: "knows_nothing", quote: sent });
  }
  return out;
}

export function checkCanon(input: CanonCheckInput): Finding[] {
  return [
    ...dateContradictions(input.text, input.canon),
    ...memberContradictions(input.text, input.bible, input.group),
    ...unknownPast(input.text),
    ...knowsNothing(input.text, input.bible),
  ];
}
