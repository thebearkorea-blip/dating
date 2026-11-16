// 사용법: node --import tsx src/tools/ledger-generate.ts --character <id> --week <YYYY-Www> [--rel-day N] [--dry-run] [--force]
// 삶 원장(M3) 한 주(월~일, KST) 생성 → 자동 검사 → 통과분 content/characters/<id>/ledger/<주>.jsonl, 걸린 것은 .data/ledger-review/<id>-<주>.jsonl(사유 포함).
// 호출: 대화 모델(CHAT_MODEL) 1회 생성 + 판단 모델(JUDGE_MODEL) 1회 canon 모순 판정 = 주당 캐릭터당 2회. docs/ops/weekly-metrics.md에 기록.
// 검사: 허용 목록(content/world/names-allow.yaml) · 일정 일치(블록 안, 취침 아님) · 사람인 척/사용자 등장 · 출력 가드 · canon 모순(Haiku).
// 규칙: 지난 사건(at < 지금)은 만들지도 고치지도 않는다. 이미 있는 주 파일은 --force 없이 덮어쓰지 않고, --force여도 지난 사건은 그대로 둔다.
// 승인 = 메인이 git diff 확인 후 커밋(배포 필요). 대기 파일의 사건은 사람이 고쳐 jsonl로 옮길 수 있다(id는 그대로).
// mock 공급자(키 없음)면 LLM을 부르지 않고 일정 블록만으로 결정적 자리표시 사건을 만든다. 콘텐츠 오염을 막으려고 mock은 --dry-run 또는 --root가 필요하다.
// rel_day: bible.story_start가 있으면 그것으로 계산, 없으면(ihan) --rel-day(그 주 월요일의 상대일, growth_state.currentRelDay 기준) 필수.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  bibleSchema,
  canonRowSchema,
  ledgerEventSchema,
  namesAllowSchema,
  scheduleSchema,
  timelineSchema,
  type Bible,
  type LedgerEvent,
  type Schedule,
} from "../content/schemas/index.js";
import { relDayFromStoryStart } from "../engine/chat.js";
import { allowedNames, allowListFindings, pretendHumanFindings, scheduleFindings } from "../engine/ledger-check.js";
import { isoWeekMonday, kstDate, ledgerPath, loadLedgerWeek, toKstIso } from "../engine/ledger.js";
import { activityAt, dayBlocks, hash32, isSleepBlock, kstParts, type EngineCharacter } from "../engine/schedule.js";
import { activeProvider, CHAT_MODEL, complete, estimateCostUsd, JUDGE_MODEL, type LlmRequest, type LlmResponse, type ModelId } from "../llm/index.js";
import { guardOutput } from "../policy/output-guard.js";
import { loadGuards } from "../policy/rules.js";
import { CHARACTER_IDS, getLang } from "../product/index.js";
import { appendMetrics } from "./diary-draft.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** 사건 생성 때 단계(선톡 가능 등) 계산용. 원장은 사용자와 무관하므로 중간값. */
const STAGE = 3;

export interface GenerateOptions {
  characterId: string;
  /** ISO 주. 예: 2026-W48 */
  week: string;
  /** 그 주 월요일의 상대일. bible.story_start가 없으면 필수 */
  relDay?: number;
  dryRun?: boolean;
  force?: boolean;
  /** 저장소 루트(content/·.data/·docs/의 부모). 기본 cwd */
  root?: string;
  /** 기본 new Date(). 이보다 앞선 사건은 만들지 않는다 */
  now?: Date;
  /** 기본: 공급자가 mock이면 mock, 아니면 llm */
  mode?: "mock" | "llm";
  /** 테스트용 LLM 주입 */
  llm?: (req: LlmRequest) => Promise<LlmResponse>;
  /** 진행 출력(CLI) */
  log?: (msg: string) => void;
}

export interface Candidate {
  event: LedgerEvent;
  /** 생성 모델이 고른 일정 블록 "HH:MM-HH:MM" */
  block?: string;
  reasons: string[];
}

export interface GenerateResult {
  week: string;
  mode: "mock" | "llm";
  passed: LedgerEvent[];
  rejected: Candidate[];
  /** 이번 실행의 LLM 호출 수 */
  calls: number;
  files: string[];
  /** dry-run(llm)일 때 생성 프롬프트 */
  prompt?: string;
}

interface Context {
  bible: Bible;
  schedule: Schedule;
  engine: EngineCharacter;
  canonFacts: string[];
  allowed: string[];
  lang: "en" | "ja";
  rules: ReturnType<typeof loadGuards>;
}

function loadContext(root: string, characterId: string): Context {
  const c = (p: string): string => join(root, "content", p);
  const yaml = (p: string): unknown => parseYaml(readFileSync(c(p), "utf8"));
  const bible = bibleSchema.parse(yaml(`characters/${characterId}/bible.yaml`));
  const schedule = scheduleSchema.parse(yaml(`characters/${characterId}/schedule.yaml`));
  const own = `world/timeline-${characterId}.yaml`;
  const timeline = timelineSchema.parse(yaml(existsSync(c(own)) ? own : "world/timeline.yaml"));
  const canonPath = c("world/canon.jsonl");
  const canonFacts = existsSync(canonPath)
    ? readFileSync(canonPath, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => canonRowSchema.parse(JSON.parse(l)))
        .filter((r) => r.character === characterId)
        .map((r) => r.fact)
    : [];
  const allow = namesAllowSchema.parse(yaml("world/names-allow.yaml"));
  if (!allow.characters[characterId]) throw new Error(`world/names-allow.yaml에 ${characterId} 항목 없음`);
  const product = (Object.keys(CHARACTER_IDS) as (keyof typeof CHARACTER_IDS)[]).find((p) => CHARACTER_IDS[p] === characterId);
  return {
    bible,
    schedule,
    engine: { id: characterId, schedule, timeline, affectionStages: bible.affection_stages },
    canonFacts,
    allowed: allowedNames(allow, characterId),
    lang: product ? getLang(product) : "en",
    rules: loadGuards(c("policy/guards.yaml")),
  };
}

const parseHm = (s: string): number => {
  const [h, m] = s.split(":");
  return Number(h) * 60 + Number(m);
};

/** 블록 "HH:MM-HH:MM"의 [시작, 끝) 분(끝이 시작 이하면 다음 날로 넘긴다). */
function blockRange(time: string): [number, number] {
  const [a, z] = time.split("-");
  const start = parseHm(a ?? "0:0") % 1440;
  let end = parseHm(z ?? "0:0");
  if (end <= start) end += 1440;
  return [start, end];
}

interface DayPlan {
  dayIndex: number;
  date: string;
  relDay: number;
  blocks: ReturnType<typeof dayBlocks>;
  notes: string[];
}

function dayPlans(ctx: Context, monday: number, relDayMonday: number): DayPlan[] {
  return Array.from({ length: 7 }, (_, d) => {
    const dayIndex = monday + d;
    const relDay = relDayMonday + d;
    const noon = kstDate(dayIndex, 12 * 60);
    const a = activityAt(ctx.engine, noon, { relDay, stage: STAGE });
    const notes: string[] = [];
    if (a.kind === "beat") notes.push(`story beat today: ${a.activity}`);
    for (const id of a.tags) {
      const ev = ctx.schedule.random_events.find((e) => e.id === id);
      if (ev) notes.push(`event today: ${ev.name} (${Object.entries(ev.effect).map(([k, v]) => `${k}=${v}`).join(", ")})`);
    }
    return { dayIndex, date: kstParts(noon).date, relDay, blocks: dayBlocks(ctx.schedule, dayIndex, relDay), notes };
  });
}

/** mock: 취침이 아닌 블록마다 사건 1개(블록 시작~끝). 같은 입력 → 같은 출력. */
function mockCandidates(ctx: Context, plans: DayPlan[]): Candidate[] {
  const place = ctx.lang === "ja" ? "(仮の場所)" : "(placeholder)";
  return plans.flatMap((p) =>
    p.blocks
      .filter((b) => !isSleepBlock(b))
      .map((b): Candidate => {
        const [start, end] = blockRange(b.time);
        return {
          block: b.time,
          reasons: [],
          event: {
            id: "",
            at: toKstIso(kstDate(p.dayIndex, start)),
            until: toKstIso(kstDate(p.dayIndex, end)),
            place,
            with: [],
            items: [],
            summary: b.activity.trim(),
            public: hash32(`${ctx.engine.id}:${p.date}:${b.time}`) % 3 === 0,
          },
        };
      }),
  );
}

export function generationPrompt(ctx: Context, week: string, plans: DayPlan[]): string {
  const language = ctx.lang === "ja" ? "Japanese" : "English";
  const summaryStyle =
    ctx.lang === "ja"
      ? 'a short Japanese phrase without a subject, e.g. "練習室で台本を三回読み直している" (max ~30 characters)'
      : 'a short present-tense phrase without a subject, starting with an -ing verb, e.g. "Running the bridge choreography again" (max ~15 words)';
  return [
    `Plan one week of everyday life for ${ctx.bible.name} (${ctx.bible.id}), a fictional character (age ${ctx.bible.age}, ${ctx.bible.position.join("/")}). Week ${week}, all times KST.`,
    `Write summary, place, items and with in ${language}. The schedule below is in Korean for reference only.`,
    "",
    "Rules:",
    "- 2 to 4 events per day, each inside one of that day's schedule blocks, never in a sleep block (취침). Events of one day must not overlap.",
    '- "block" must be the block time exactly as listed; "start" (and "end", if given) must fall inside that block.',
    `- summary: ${summaryStyle}. It must fit the block's activity.`,
    '- place: a generic place (e.g. "the practice room", "練習室") or an allowed name.',
    '- with: only names from the allowed list, written exactly as listed; [] if alone.',
    `- Proper nouns: use ONLY these: ${ctx.allowed.join(", ")}. Never invent names of people, places, shops, shows, songs, brands, companies, or real celebrities.`,
    "- The person he chats with (the user) never appears. No meetings with fans or the user, no calls with the user, nothing that claims or proves he is a physical human. He is an AI living his daily life in a cyber world; keep it ordinary.",
    "- Do not contradict the known facts. Respect the never-rules.",
    "- public: true only for things he could post on SNS (practice, food, a walk); false for private moments (family, worries).",
    "",
    "Supporting people:",
    ...ctx.bible.members.map((m) => `- ${m.id}: ${m.relation}`),
    "",
    "Never-rules:",
    ...ctx.bible.never.map((x) => `- ${x}`),
    "",
    "Known facts:",
    ...(ctx.canonFacts.length ? ctx.canonFacts.map((f) => `- ${f}`) : ["- (none)"]),
    "",
    "Schedule:",
    ...plans.flatMap((p) => [
      `${DAY_NAMES[new Date(p.dayIndex * 86400000).getUTCDay()]} ${p.date}${p.notes.length ? ` — ${p.notes.join("; ")}` : ""}`,
      ...p.blocks.map((b) => `  - ${b.time} ${b.activity.trim()} (busy ${b.busy})${isSleepBlock(b) ? " [sleep]" : ""}`),
    ]),
    "",
    'Output a JSON array only, no prose. Each item: {"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","block":"HH:MM-HH:MM","place":"...","with":[],"items":[],"summary":"...","public":false}. "end" is optional.',
  ].join("\n");
}

const rawSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  block: z.string().min(1),
  place: z.string().min(1),
  with: z.array(z.string()).default([]),
  items: z.array(z.string()).default([]),
  summary: z.string().min(1),
  public: z.boolean(),
});

/** 생성 모델 출력(JSON 배열) → 후보. 형식이 틀린 항목은 사유 format으로 남긴다. 배열이 없으면 throw. */
export function parseGeneration(text: string): Candidate[] {
  const i = text.indexOf("[");
  const j = text.lastIndexOf("]");
  if (i < 0 || j < i) throw new Error("JSON 배열 없음");
  const arr = JSON.parse(text.slice(i, j + 1)) as unknown;
  if (!Array.isArray(arr)) throw new Error("JSON 배열 아님");
  return arr.map((item): Candidate => {
    const r = rawSchema.safeParse(item);
    if (!r.success) {
      return { reasons: ["format"], event: { id: "", at: "1970-01-01T09:00:00+09:00", place: "-", with: [], items: [], summary: JSON.stringify(item).slice(0, 300), public: false } };
    }
    const v = r.data;
    const day = Date.parse(`${v.date}T00:00:00Z`) / 86400000;
    const startMin = parseHm(v.start);
    let endMin = v.end ? parseHm(v.end) : undefined;
    if (endMin !== undefined && endMin <= startMin) endMin += 1440;
    return {
      block: v.block,
      reasons: [],
      event: {
        id: "",
        at: toKstIso(kstDate(day, startMin)),
        ...(endMin !== undefined ? { until: toKstIso(kstDate(day, endMin)) } : {}),
        place: v.place,
        with: v.with,
        items: v.items,
        summary: v.summary,
        public: v.public,
      },
    };
  });
}

/** canon 모순 판정(판단 모델 1회). 형식이 틀리면 전부 걸린 것으로 본다. */
async function judgeCanon(
  ctx: Context,
  cands: Candidate[],
  llm: (req: LlmRequest) => Promise<LlmResponse>,
): Promise<{ flags: Map<string, string>; res: LlmResponse | null; unparsed: boolean }> {
  const flags = new Map<string, string>();
  if (cands.length === 0) return { flags, res: null, unparsed: false };
  const prompt = [
    `Known facts about ${ctx.bible.name}:`,
    ...(ctx.canonFacts.length ? ctx.canonFacts.map((f) => `- ${f}`) : ["- (none)"]),
    "",
    "Planned events (key: event, KST time, scheduled block activity in Korean, place, with, summary):",
    ...cands.map((c) => `- ${c.event.id} | ${c.event.at}${c.event.until ? `~${c.event.until}` : ""} | ${c.block ?? ""} | ${c.event.place} | ${c.event.with.join(", ")} | ${c.event.summary}`),
    "",
    'Return JSON only: {"flags":[{"id":"<event id>","reason":"<short reason>"}]} listing only events that contradict a known fact, clearly do not fit the scheduled activity, or show him meeting or calling the user or fans as if he were a physical human. Return {"flags":[]} if none.',
  ].join("\n");
  const res = await llm({
    model: JUDGE_MODEL,
    maxTokens: 1500,
    temperature: 0,
    messages: [
      { role: "system", content: "You check a fictional character's planned daily events for consistency. Reply with JSON only." },
      { role: "user", content: prompt },
    ],
  });
  try {
    const i = res.text.indexOf("{");
    const j = res.text.lastIndexOf("}");
    const parsed = z
      .object({ flags: z.array(z.object({ id: z.string(), reason: z.string() })) })
      .parse(JSON.parse(res.text.slice(i, j + 1)));
    for (const f of parsed.flags) flags.set(f.id, f.reason);
    return { flags, res, unparsed: false };
  } catch {
    return { flags, res, unparsed: true };
  }
}

function writeJsonl(path: string, rows: unknown[]): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
}

export async function runLedgerGenerate(opts: GenerateOptions): Promise<GenerateResult> {
  const root = opts.root ?? process.cwd();
  const log = opts.log ?? (() => {});
  const now = opts.now ?? new Date();
  const mode = opts.mode ?? (activeProvider() === "mock" ? "mock" : "llm");
  if (mode === "mock" && !opts.dryRun && opts.root === undefined) {
    throw new Error("mock 모드는 자리표시 사건이라 콘텐츠를 더럽힌다: --dry-run 또는 --root <임시 폴더>를 쓰세요");
  }
  const ctx = loadContext(root, opts.characterId);
  const monday = isoWeekMonday(opts.week);
  const storyStart = ctx.bible.story_start;
  const relDayMonday = opts.relDay ?? (storyStart ? relDayFromStoryStart(storyStart, kstDate(monday, 12 * 60)) : undefined);
  if (relDayMonday === undefined) throw new Error(`${opts.characterId}: bible.story_start가 없어 --rel-day(그 주 월요일의 상대일)가 필요합니다`);
  const plans = dayPlans(ctx, monday, relDayMonday);
  const relDayOf = (dayIndex: number): number => relDayMonday + (dayIndex - monday);

  const contentRoot = join(root, "content");
  const outPath = ledgerPath(opts.characterId, opts.week, contentRoot);
  const existing = existsSync(outPath) ? loadLedgerWeek(opts.characterId, opts.week, contentRoot) : [];
  if (existsSync(outPath) && !opts.force && !opts.dryRun) throw new Error(`${outPath} 이미 있음: 커밋된 원장은 불변(--force는 앞으로의 사건만 바꾼다)`);

  const result: GenerateResult = { week: opts.week, mode, passed: [], rejected: [], calls: 0, files: [] };
  const llm = opts.llm ?? complete;
  let cands: Candidate[];
  if (mode === "mock") {
    cands = mockCandidates(ctx, plans);
  } else {
    const prompt = generationPrompt(ctx, opts.week, plans);
    if (opts.dryRun) {
      result.prompt = prompt;
      log(`[dry-run] ${opts.characterId} ${opts.week} rel_day ${relDayMonday}~${relDayMonday + 6}, 프롬프트 토큰 추정 ${Math.ceil(prompt.length / 4)}, 호출 ${CHAT_MODEL} 1회 + ${JUDGE_MODEL} 1회`);
      log("--- prompt ---\n" + prompt);
      return result;
    }
    const res = await llm({ model: CHAT_MODEL, maxTokens: 8000, temperature: 0.8, messages: [{ role: "user", content: prompt }] });
    result.calls++;
    if (res.usage) appendMetrics(root, "ledger-generate", CHAT_MODEL, res.usage, estimateCostUsd(CHAT_MODEL, res.usage));
    try {
      cands = parseGeneration(res.text);
    } catch (e) {
      const raw = join(root, ".data/ledger-review", `${opts.characterId}-${opts.week}.raw.txt`);
      mkdirSync(resolve(raw, ".."), { recursive: true });
      writeFileSync(raw, res.text);
      throw new Error(`생성 출력 해석 실패(${(e as Error).message}). 원문: ${raw}`);
    }
  }

  // 지난 사건은 만들지 않는다(불변 규칙). --force면 기존의 지난 사건은 그대로 둔다.
  const kept = existing.filter((e) => Date.parse(e.at) < now.getTime());
  cands = cands.filter((c) => c.reasons.includes("format") || Date.parse(c.event.at) >= now.getTime());
  // 형식이 틀린 항목은 맨 뒤 번호(정상 사건 번호를 시각 순으로 먼저 준다).
  const fmt = (c: Candidate): number => (c.reasons.includes("format") ? 1 : 0);
  cands.sort((a, b) => fmt(a) - fmt(b) || Date.parse(a.event.at) - Date.parse(b.event.at));
  const maxNo = kept.reduce((m, e) => Math.max(m, Number(e.id.slice(e.id.lastIndexOf("-") + 1))), 0);
  cands.forEach((c, i) => {
    c.event.id = `${opts.characterId}-${opts.week}-${String(maxNo + i + 1).padStart(2, "0")}`;
  });

  for (const c of cands) {
    if (c.reasons.includes("format")) continue;
    const e = c.event;
    if (!ledgerEventSchema.safeParse(e).success) c.reasons.push("schema");
    const day = kstParts(new Date(Date.parse(e.at))).dayIndex;
    if (day < monday || day > monday + 6) c.reasons.push("schedule:outside_week");
    c.reasons.push(...allowListFindings(e, ctx.allowed), ...pretendHumanFindings(e), ...scheduleFindings(e, ctx.schedule, relDayOf, c.block));
    const g = guardOutput([e.summary, e.place, ...e.items].join("\n"), ctx.rules);
    if (g.blocked) c.reasons.push(...g.findings.filter((f) => f.severity === "block").map((f) => `guard:${f.rule_id}`));
  }

  if (mode === "llm") {
    const judged = await judgeCanon(ctx, cands.filter((c) => c.reasons.length === 0), llm);
    if (judged.res) {
      result.calls++;
      if (judged.res.usage) appendMetrics(root, "ledger-generate/canon", JUDGE_MODEL as ModelId, judged.res.usage, estimateCostUsd(JUDGE_MODEL, judged.res.usage));
    }
    for (const c of cands) {
      if (c.reasons.length > 0) continue;
      if (judged.unparsed) c.reasons.push("canon:judge_unparsed");
      const r = judged.flags.get(c.event.id);
      if (r) c.reasons.push(`canon:${r}`);
    }
  }

  result.passed = cands.filter((c) => c.reasons.length === 0).map((c) => c.event);
  result.rejected = cands.filter((c) => c.reasons.length > 0);
  log(`${opts.characterId} ${opts.week} (${mode}): 통과 ${result.passed.length} · 대기 ${result.rejected.length} · 유지(지난 사건) ${kept.length} · LLM 호출 ${result.calls}회`);
  if (opts.dryRun) return result;

  const merged = [...kept, ...result.passed].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  writeJsonl(outPath, merged);
  result.files.push(outPath);
  const reviewPath = join(root, ".data/ledger-review", `${opts.characterId}-${opts.week}.jsonl`);
  writeJsonl(
    reviewPath,
    result.rejected.map((c) => ({ ...c.event, ...(c.block ? { block: c.block } : {}), reasons: c.reasons })),
  );
  result.files.push(reviewPath);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      character: { type: "string" },
      week: { type: "string" },
      "rel-day": { type: "string" },
      root: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
  });
  if (!values.character || !values.week || !/^\d{4}-W\d{2}$/.test(values.week)) {
    console.error("usage: ledger-generate.ts --character <id> --week YYYY-Www [--rel-day N] [--dry-run] [--force] [--root <dir>]");
    process.exit(2);
  }
  runLedgerGenerate({
    characterId: values.character,
    week: values.week,
    relDay: values["rel-day"] === undefined ? undefined : Number(values["rel-day"]),
    root: values.root,
    dryRun: values["dry-run"],
    force: values.force,
    log: (m) => console.log(m),
  })
    .then((r) => {
      for (const f of r.files) console.log(f);
      if (r.mode === "mock" && values["dry-run"]) for (const e of r.passed) console.log(JSON.stringify(e));
    })
    .catch((e: Error) => {
      console.error(e.message);
      process.exit(1);
    });
}
