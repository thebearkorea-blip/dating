// 페르소나 프롬프트 조립. 순수 함수. 모델 문자열은 다루지 않는다(src/llm/index.ts 몫).
import type { Bible, CanonRow } from "../content/schemas/index.js";
import type { Activity } from "./schedule.js";

export interface PersonaInput {
  bible: Bible;
  /** voice.md 원문 */
  voiceMd: string;
  canon: CanonRow[];
  activity: Activity;
  /** 애정 단계 1~5 */
  stage: number;
  /** 2층: 관계 프로필(선택) */
  profile?: string;
  /** 3층: 기억(선택) */
  memories?: string[];
  canonLimit?: number;
}

export interface PersonaPrompt {
  system: string;
  cacheable_prefix: string;
  dynamic_suffix: string;
  tokens_estimate: number;
}

const CANON_LIMIT = 30;

/** voice.md에서 검수 기록 절(## 7.)부터는 뺀다. */
function voiceRules(md: string): string {
  const i = md.search(/^## 7\./m);
  return (i < 0 ? md : md.slice(0, i)).trim();
}

function biblePrefix(b: Bible): string {
  const lines = [
    `# 캐릭터: ${b.name} (${b.id}), ${b.age}세, 그룹 ${b.group_id}, 포지션 ${b.position.join("·")}`,
    `성격 방향: ${b.personality_direction}`,
    "## 멤버",
    ...b.members.map((m) => `- ${m.id}: ${m.relation} (말투: ${m.voice_hint})`),
    "## 절대 하지 않는 행동",
    ...b.never.map((x) => `- ${x}`),
    "## 모르는 것",
    ...b.knows_nothing_about.map((x) => `- ${x}`),
    "## 첫 만남",
    b.first_meeting.premise,
    "## 취향 불일치(비난하지 않고 자기 선택을 지킨다)",
    ...b.mismatches.map((x) => `- ${x}`),
    "## 한국어가 튀어나오는 조건",
    ...b.korean_slip_conditions.map((x) => `- ${x}`),
  ];
  return lines.join("\n");
}

function canonPrefix(canon: CanonRow[], limit: number): string {
  const recent = canon
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.at < b.r.at ? -1 : a.r.at > b.r.at ? 1 : a.i - b.i))
    .slice(-limit)
    .map(({ r }) => `- [${r.at}] ${r.fact}`);
  return ["## 최근 캐논(이미 공개된 사실, 모순 금지)", ...(recent.length ? recent : ["- (없음)"])].join("\n");
}

function suffix(i: PersonaInput): string {
  const st = i.bible.affection_stages.find((s) => s.stage === i.stage);
  const a = i.activity;
  const lines = [
    "# 오늘의 상태 (KST 기준)",
    `활동: ${a.activity}`,
    `busy: ${a.busy}/3`,
    `기분: ${a.mood}`,
    `답장 지연: ${a.replyDelayRange.min}~${a.replyDelayRange.max}분`,
    `먼저 연락 가능: ${a.canInitiate ? "예" : "아니오"}`,
  ];
  if (st) {
    lines.push(
      `# 애정 단계 ${st.stage}: ${st.name}`,
      `행동: ${st.behaviors.join(", ")}`,
      `호칭: ${st.address}`,
      `하루 선톡: ${st.initiative_per_day}회`,
    );
  }
  const secrets = i.bible.secrets.filter((s) => s.unlock_stage <= i.stage);
  if (secrets.length) lines.push("# 털어놓을 수 있는 비밀", ...secrets.map((s) => `- ${s.id}: ${s.text}`));
  if (i.profile) lines.push("# 사용자 관계 프로필", i.profile);
  if (i.memories?.length) lines.push("# 기억", ...i.memories.map((m) => `- ${m}`));
  return lines.join("\n");
}

export function buildPersona(input: PersonaInput): PersonaPrompt {
  const cacheable_prefix = [
    biblePrefix(input.bible),
    "# 말투 규칙·예문",
    voiceRules(input.voiceMd),
    canonPrefix(input.canon, input.canonLimit ?? CANON_LIMIT),
  ].join("\n\n");
  const dynamic_suffix = suffix(input);
  const system = `${cacheable_prefix}\n\n${dynamic_suffix}`;
  return { system, cacheable_prefix, dynamic_suffix, tokens_estimate: Math.ceil(system.length / 4) };
}
