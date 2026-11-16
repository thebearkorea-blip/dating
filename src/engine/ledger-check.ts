// 삶 원장 사건 자동 검사(M3). LLM 없음. 생성 도구(ledger-generate)와 validate-content가 같이 쓴다.
// ① 허용 목록: names-allow.yaml에 없는 고유명사로 보이는 것(en 대문자 단어, ja 가타카나·한자 이름·『』, ko 한글 이름·《》)을 잡는다(휴리스틱 — 걸리면 사람 확인 대기).
// ② 사람인 척: 사용자가 나오는 장면(원장은 모든 사용자가 공유) + 오프라인 만남·실시간 인증·통화·주소류.
// ③ 일정 일치: 사건 시각이 그날 일정 블록 안이고 취침 블록이 아니다(생성 때만 — 상대일이 필요하다).
import type { LedgerEvent, NamesAllow, Schedule } from "../content/schemas/index.js";
import { blockAt, isSleepBlock, kstParts } from "./schedule.js";

/** 캐릭터의 허용 고유명사 전부(사람·장소·작품·단체·기타). 항목이 없으면 []. */
export function allowedNames(allow: NamesAllow, characterId: string): string[] {
  const c = allow.characters[characterId];
  return c ? [...c.people, ...c.places, ...c.works, ...c.orgs, ...c.other] : [];
}

const MASK = "\u0000";
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LATIN = /[A-Za-z]/;

/** 허용 이름을 가린다(긴 것부터). 라틴 문자 이름은 단어 경계, 그 밖은 부분 문자열. */
function maskAllowed(text: string, allowed: string[]): string {
  let out = text;
  for (const name of [...allowed].sort((a, b) => b.length - a.length)) {
    const re = LATIN.test(name) ? new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, "gu") : new RegExp(escapeRe(name), "gu");
    out = out.replace(re, MASK);
  }
  return out;
}

/** 대문자로 써도 고유명사가 아닌 것(요일·달·약어·대명사). */
const EN_COMMON = new Set([
  "I", "I'm", "I'll", "I've", "I'd", "OK", "NG", "TV", "SNS", "PD", "MC", "CF", "AI", "KST", "DM", "BGM", "OST", "AM", "PM", "MV",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
]);
/** 문장 첫머리에 흔히 오는 일반 단어(소문자로 비교). -ing·-ed 동사는 따로 통과시킨다. */
const EN_STARTERS = new Set([
  "a", "an", "the", "he", "his", "him", "she", "her", "they", "their", "we", "our", "it", "its", "this", "that", "these", "those",
  "after", "before", "at", "in", "on", "with", "for", "from", "to", "by", "during", "between", "back", "late", "early", "quick", "short", "long",
  "and", "but", "then", "still", "just", "first", "last", "next", "one", "two", "three", "some", "another", "lunch", "dinner", "breakfast",
  "practice", "rehearsal", "vocal", "dance", "solo", "group", "team", "morning", "afternoon", "evening", "night", "midnight", "dawn",
  "walk", "nap", "shower", "laundry", "reading", "rest", "break", "call", "video", "dorm", "home", "studio", "home-cooked",
]);
const SENTENCE_END = /[.!?。！？\n"“:]$/;

/** 영어: 허용 목록 밖 대문자 단어. 문장 첫 단어는 흔한 단어·-ing·-ed면 통과. */
function enFindings(masked: string): string[] {
  const out: string[] = [];
  for (const m of masked.matchAll(/(?<![\p{L}\p{N}'’])\p{Lu}[\p{L}'’-]*/gu)) {
    const word = m[0].replace(/['’]s$/, "");
    if (EN_COMMON.has(word)) continue;
    const before = masked.slice(0, m.index).trimEnd();
    const start = before === "" || SENTENCE_END.test(before);
    if (start && (EN_STARTERS.has(word.toLowerCase()) || /(?:ing|ed)$/.test(word))) continue;
    out.push(word);
  }
  return out;
}

/** 이름 뒤에 붙는 호칭 앞이 사람 이름이 아닌 흔한 말(皆さん·お母さん·監督さん 등). */
const JA_NOT_NAME = new Set(["皆", "母", "父", "兄", "姉", "弟", "妹", "叔母", "叔父", "祖母", "祖父", "客", "お客", "奥", "相手", "大家", "監督", "室長", "先生", "社長", "先輩", "店長", "記者", "作家", "俳優", "運転手", "撮影", "照明", "助", "樹木医"]);

/** 일본어: ・가 든 가타카나 이름, 호칭이 붙은 가타카나·한자 이름, 『』《》 작품명, 地名 접미사. */
function jaFindings(masked: string): string[] {
  const out: string[] = [];
  for (const m of masked.matchAll(/[\p{Script=Katakana}ー]+・[\p{Script=Katakana}ー・]+/gu)) out.push(m[0]);
  for (const m of masked.matchAll(/([\p{Script=Katakana}ー]{1,8}|\p{Script=Han}{1,4})(?:さん|くん|君|ちゃん|先生|監督|室長|社長|先輩|氏|様)/gu)) {
    const name = m[1] as string;
    if (!JA_NOT_NAME.has(name)) out.push(name);
  }
  for (const m of masked.matchAll(/(?:[\p{Script=Katakana}ー]{2,}|\p{Script=Han}{1,4})(?:駅|区|市|町|村|県|通り|公園|劇場|大学|病院|神社|寺|橋)/gu)) out.push(m[0]);
  return out;
}

const KO_NOT_NAME = new Set(["선생", "감독", "실장", "매니저", "사장", "팀장", "작가", "기자", "고객", "손님", "사모", "부장", "부모", "어머", "아버", "할머", "할아버", "교수", "원장", "대표", "회장"]);

/** 한국어: 호칭(씨·님·선배·감독·실장)이 붙은 한글 이름. */
function koFindings(masked: string): string[] {
  const out: string[] = [];
  for (const m of masked.matchAll(/([가-힣]{2,4})(?:씨|님|선배|감독|실장)/gu)) {
    const name = m[1] as string;
    if (!KO_NOT_NAME.has(name)) out.push(name);
  }
  return out;
}

/** 작품·제목 괄호(『』《》) 안이 허용 목록에 없으면 잡는다. */
function titleFindings(masked: string): string[] {
  const out: string[] = [];
  for (const m of masked.matchAll(/[『《]([^』》]*)[』》]/gu)) {
    const inner = (m[1] as string).replaceAll(MASK, "").trim();
    if (inner) out.push(m[0]);
  }
  return out;
}

/** 문장 하나에서 허용 목록 밖 고유명사 후보(중복 제거, 등장 순). 언어 구분 없이 모든 휴리스틱을 돌린다. */
export function properNounFindings(text: string, allowed: string[]): string[] {
  const masked = maskAllowed(text, allowed);
  return [...new Set([...enFindings(masked), ...jaFindings(masked), ...koFindings(masked), ...titleFindings(masked)])];
}

/** 사건 하나의 허용 목록 위반 사유. with는 항목 전체가 허용 목록과 정확히 같아야 한다. */
export function allowListFindings(e: LedgerEvent, allowed: string[]): string[] {
  const reasons: string[] = [];
  const set = new Set(allowed);
  for (const w of e.with) if (!set.has(w)) reasons.push(`names:with:${w}`);
  const fields: [string, string][] = [["summary", e.summary], ["place", e.place], ...e.items.map((x): [string, string] => ["items", x])];
  for (const [field, text] of fields) for (const n of properNounFindings(text, allowed)) reasons.push(`names:${field}:${n}`);
  return reasons;
}

/** 사용자 언급(원장은 공유라 사용자가 나오면 안 된다). */
const USER_REF: RegExp[] = [
  /\b(?:you|your|yours|the user|girlfriend|boyfriend)\b/i,
  /(?:あなた|(?<![\p{Script=Katakana}\p{Script=Han}ー])君(?!た)|ユーザー|恋人)/u,
  /(?:너랑|너를|너에게|너한테|당신|사용자|유저|여자친구|연인)/,
];
/** 사람인 척(오프라인 만남·실시간 인증·주소·위치). */
const PRETEND_HUMAN: RegExp[] = [
  /\b(?:in person|offline|irl|in real life|live location|home address|real[- ]time|proof (?:that|he)|prove[sd]? (?:he|that)|verif(?:y|ied|ication))\b/i,
  /\b(?:call(?:s|ed|ing)?|phone[sd]?|facetime[sd]?|video[- ]?call(?:s|ed)?|voice[- ]?call(?:s|ed)?|text(?:s|ed)?)\b[^.!?]*\b(?:a fan|fans|the user)\b/i,
  /(?:オフライン|対面|直接会|会いに行|住所|位置情報|リアルタイム|本物だと|証明|ファンと(?:電話|通話|会))/,
  /(?:오프라인|직접 만나|만나러 가|주소|위치 공유|실시간|진짜 사람|증명|팬과 (?:통화|만나))/,
];
const USER_IN_WITH = /^(?:user|the user|you|her|fan|fans|a fan|あなた|君|ユーザー|ファン|너|당신|사용자|팬)$/i;

/** 사람인 척·사용자 등장 사유. */
export function pretendHumanFindings(e: LedgerEvent): string[] {
  const reasons: string[] = [];
  for (const w of e.with) if (USER_IN_WITH.test(w.trim())) reasons.push(`pretend_human:with:${w}`);
  const text = [e.summary, e.place, ...e.items].join("\n");
  for (const re of USER_REF) {
    const m = re.exec(text);
    if (m) reasons.push(`pretend_human:user_reference:${m[0]}`);
  }
  for (const re of PRETEND_HUMAN) {
    const m = re.exec(text);
    if (m) reasons.push(`pretend_human:${m[0]}`);
  }
  return reasons;
}

/**
 * 일정 일치. relDayOf = KST 날짜 일련번호 → 그날 상대일. block = 생성 모델이 고른 블록 시각("HH:MM-HH:MM", 있으면 실제 블록과 같아야 한다).
 * 사건 시작이 취침 블록이면, until 직전이 취침 블록이면, until이 16시간 넘게 뒤면 위반.
 */
export function scheduleFindings(e: LedgerEvent, schedule: Schedule, relDayOf: (dayIndex: number) => number, block?: string): string[] {
  const reasons: string[] = [];
  const at = new Date(Date.parse(e.at));
  const b = blockAt(schedule, at, relDayOf(kstParts(at).dayIndex));
  if (isSleepBlock(b)) reasons.push(`schedule:sleep:${b.time}`);
  if (block !== undefined && block !== b.time) reasons.push(`schedule:block_mismatch:${block}!=${b.time}`);
  if (e.until) {
    const until = Date.parse(e.until);
    if (until - at.getTime() > 16 * 3600000) reasons.push("schedule:too_long");
    // 시작 블록 안에서 끝나면 통과(자정을 넘는 블록은 다음 날 일정표가 취침으로 시작해도 그 블록이 이긴다).
    if (until <= blockEndAfter(b.time, at)) return reasons;
    const last = new Date(until - 60000);
    const lb = blockAt(schedule, last, relDayOf(kstParts(last).dayIndex));
    if (isSleepBlock(lb)) reasons.push(`schedule:until_in_sleep:${lb.time}`);
  }
  return reasons;
}

/** at이 든 블록의 끝 시각(ms). 블록 "HH:MM-HH:MM"에서 끝이 시작 이하면 다음 날. at이 자정 뒤 꼬리 부분이면 그날 끝. */
function blockEndAfter(time: string, at: Date): number {
  const [a, z] = time.split("-");
  const hm = (s: string): number => Number(s.split(":")[0]) * 60 + Number(s.split(":")[1]);
  const start = hm(a ?? "0:0") % 1440;
  let end = hm(z ?? "0:0");
  if (end <= start) end += 1440;
  const minutes = kstParts(at).minutes;
  const dayStart = at.getTime() - minutes * 60000 - (at.getTime() % 60000);
  // at이 블록의 자정 뒤 부분(분 < start)이면 블록은 어제 시작했다.
  const startMs = dayStart + (minutes >= start ? start : start - 1440) * 60000;
  return startMs + (end - start) * 60000;
}

/** 주 파일 단위 구조 검사: id 중복·id의 주·at이 그 주(KST) 안인지. weekMonday = 월요일 KST 날짜 일련번호. */
export function weekFileFindings(events: LedgerEvent[], characterId: string, week: string, weekMonday: number): string[] {
  const reasons: string[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.id)) reasons.push(`${e.id}: id 중복`);
    seen.add(e.id);
    if (!e.id.startsWith(`${characterId}-${week}-`)) reasons.push(`${e.id}: id가 ${characterId}-${week}-NN 형식이 아님`);
    const day = kstParts(new Date(Date.parse(e.at))).dayIndex;
    if (day < weekMonday || day > weekMonday + 6) reasons.push(`${e.id}: at(${e.at})이 ${week} 밖`);
  }
  return reasons;
}
