// 사용법: node --import tsx src/tools/diary-draft.ts --date YYYY-MM-DD --n 3 [--rel-day N] [--dry-run]
// rel-day는 타임라인 기준 값(예: -180). docs/ops/diary-topics.md 표 맨 끝 rel_day 열과 맞춘다.
// 생략하면 -181 + min(30, 날짜의 day).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import {
  bibleSchema,
  canonRowSchema,
  groupSchema,
  scheduleSchema,
  timelineSchema,
  type CanonRow,
} from "../content/schemas/index.js";
import { checkCanon } from "../engine/canon-check.js";
import { buildPersona, type PersonaPrompt } from "../engine/persona.js";
import { activityAt, type Activity } from "../engine/schedule.js";
import { CHAT_MODEL, complete, estimateCostUsd, hasLlmKey, type ModelId } from "../llm/index.js";
import { outcome, review } from "../policy/reviewer.js";

const METRICS_HEADER =
  "# 주간 지표 (LLM 호출 비용 기록)\n\n| 날짜 | 도구 | 모델 | 입력토큰 | 출력토큰 | 비용(USD) |\n|---|---|---|---|---|---|\n";
const STAGE = 1;
/** 일기는 밤에 쓴다고 가정(KST) */
const WRITE_TIME = "21:00";
const TONES = [
  "quiet and observational, one concrete small detail",
  "light and a little self-teasing, understated humor",
  "tender and reflective, ends on a soft unresolved note",
];

export interface Topic {
  relDay: number;
  topic: string;
  scheduleActivity: string;
  photoTags: string;
}

export function parseTopics(md: string): Topic[] {
  const out: Topic[] = [];
  for (const line of md.split("\n")) {
    const m = /^\|\s*D\d+\s*\|(.+)$/.exec(line);
    if (!m) continue;
    const cells = (m[1] as string).split("|").map((c) => c.trim());
    if (cells.at(-1) === "") cells.pop();
    const relDay = Number(cells.at(-1));
    if (!Number.isInteger(relDay)) continue;
    out.push({ relDay, topic: cells[0] ?? "", scheduleActivity: cells[1] ?? "", photoTags: cells[2] ?? "" });
  }
  return out;
}

/** 날짜 순서 기본값(타임라인 rel_day): -181 + min(30, 날짜의 day) */
export function defaultRelDay(date: string): number {
  return -181 + Math.min(30, Number(date.slice(8, 10)));
}

export interface Draft {
  frontmatter: { date: string; rel_day: number; activity: string; mood: string; photos: string[]; audience: "public" };
  body: string;
}

export function renderDraft(d: Draft, reviewJson: unknown): string {
  // 주석 종료 문자열이 본문에 섞이지 않도록 '>'를 이스케이프한다.
  const rv = JSON.stringify(reviewJson).replaceAll(">", "\\u003e");
  return `---\n${toYaml(d.frontmatter)}---\n${d.body.trim()}\n\n<!-- review: ${rv} -->\n`;
}

export function appendMetrics(
  root: string,
  tool: string,
  model: ModelId,
  usage: { inputTokens: number; outputTokens: number },
  costUsd: number,
): void {
  const path = resolve(root, "docs/ops/weekly-metrics.md");
  if (!existsSync(path)) {
    mkdirSync(resolve(root, "docs/ops"), { recursive: true });
    writeFileSync(path, METRICS_HEADER);
  }
  const today = new Date().toISOString().slice(0, 10);
  const row = `| ${today} | ${tool} | ${model} | ${usage.inputTokens} | ${usage.outputTokens} | ${costUsd.toFixed(5)} |\n`;
  const cur = readFileSync(path, "utf8");
  appendFileSync(path, cur.endsWith("\n") ? row : "\n" + row);
}

export interface DraftOptions {
  date: string;
  n: number;
  relDay?: number;
  dryRun?: boolean;
  root?: string;
}

function loadContext(root: string) {
  const c = (p: string): string => resolve(root, "content", p);
  const yaml = (p: string): unknown => parseYaml(readFileSync(c(p), "utf8"));
  const canonPath = c("world/canon.jsonl");
  const canon: CanonRow[] = existsSync(canonPath)
    ? readFileSync(canonPath, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => canonRowSchema.parse(JSON.parse(l)))
    : [];
  return {
    bible: bibleSchema.parse(yaml("characters/ihan/bible.yaml")),
    schedule: scheduleSchema.parse(yaml("characters/ihan/schedule.yaml")),
    timeline: timelineSchema.parse(yaml("world/timeline.yaml")),
    group: groupSchema.parse(yaml("world/group.yaml")),
    voiceMd: readFileSync(c("characters/ihan/voice.md"), "utf8"),
    canon,
  };
}

function userPrompt(topic: Topic, activity: Activity, tone: string): string {
  return [
    "Write today's public diary entry as this character, in English, first person.",
    "Length: 120-220 words. Plain prose, no title, no hashtags, no emojis, no markdown.",
    "Do not mention uniforms, school, or anything from before the debut period. Do not invent new members or dates.",
    `Topic (Korean, for your reference only): ${topic.topic}`,
    `Today's activity: ${activity.activity}`,
    `Tone for this draft: ${tone}`,
  ].join("\n");
}

export interface DraftResult {
  topic: Topic;
  activity: Activity;
  persona: PersonaPrompt;
  promptTokens: number;
  files: string[];
}

export async function runDraft(opts: DraftOptions): Promise<DraftResult> {
  const root = opts.root ?? process.cwd();
  const relDay = opts.relDay ?? defaultRelDay(opts.date);
  const topics = parseTopics(readFileSync(resolve(root, "docs/ops/diary-topics.md"), "utf8"));
  const topic = topics.find((t) => t.relDay === relDay);
  if (!topic) throw new Error(`diary-topics에 rel_day ${relDay} 없음`);

  const ctx = loadContext(root);
  const activity = activityAt(
    { id: ctx.bible.id, schedule: ctx.schedule, timeline: ctx.timeline, affectionStages: ctx.bible.affection_stages },
    new Date(`${opts.date}T${WRITE_TIME}:00+09:00`),
    { relDay, stage: STAGE },
  );
  const persona = buildPersona({ bible: ctx.bible, voiceMd: ctx.voiceMd, canon: ctx.canon, activity, stage: STAGE, group: ctx.group });
  const promptTokens = persona.tokens_estimate + Math.ceil(userPrompt(topic, activity, TONES[0] as string).length / 4);
  const result: DraftResult = { topic, activity, persona, promptTokens, files: [] };

  if (opts.dryRun) {
    console.log(`[dry-run] ${opts.date} rel_day ${relDay}: ${topic.topic}`);
    console.log(`활동: ${activity.activity} / 기분: ${activity.mood}`);
    console.log(`프롬프트 토큰 추정: ${promptTokens} (system ${persona.tokens_estimate}) x ${opts.n}회, 모델 ${CHAT_MODEL}`);
    console.log("--- user prompt ---\n" + userPrompt(topic, activity, TONES[0] as string));
    return result;
  }
  if (!hasLlmKey()) throw new Error("ANTHROPIC_API_KEY 없음: --dry-run만 가능");

  const dir = resolve(root, "content/characters/ihan/diary/_drafts");
  mkdirSync(dir, { recursive: true });
  const canonTexts = ctx.canon.map((r) => r.fact);
  for (let i = 1; i <= opts.n; i++) {
    const tone = TONES[(i - 1) % TONES.length] as string;
    const res = await complete({
      model: CHAT_MODEL,
      maxTokens: 700,
      temperature: 0.9,
      messages: [
        { role: "system", content: persona.system },
        { role: "user", content: userPrompt(topic, activity, tone) },
      ],
    });
    if (res.usage) appendMetrics(root, "diary-draft", CHAT_MODEL, res.usage, estimateCostUsd(CHAT_MODEL, res.usage));
    const body = res.text.trim();

    const verdict = await review(body, { root, canon: canonTexts });
    if (verdict.usage.inputTokens + verdict.usage.outputTokens > 0) {
      appendMetrics(root, "diary-draft/review", "anthropic/claude-haiku-5-5", verdict.usage, verdict.usage.costUsd);
    }
    const canonFindings = checkCanon({ text: body, canon: ctx.canon, bible: ctx.bible, group: ctx.group });
    const file = resolve(dir, `${opts.date}-${i}.md`);
    writeFileSync(
      file,
      renderDraft(
        {
          frontmatter: { date: opts.date, rel_day: relDay, activity: activity.activity, mood: activity.mood, photos: [], audience: "public" },
          body,
        },
        { outcome: outcome(verdict), stage2: verdict.stage2, findings: verdict.findings, canon_check: canonFindings },
      ),
    );
    result.files.push(file);
    console.log(`${file}: ${outcome(verdict)} (canon-check ${canonFindings.length}건)`);
  }
  return result;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const date = arg("--date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("usage: diary-draft.ts --date YYYY-MM-DD --n 3 [--rel-day N] [--dry-run]");
    process.exit(2);
  }
  const rel = arg("--rel-day");
  runDraft({
    date,
    n: Number(arg("--n") ?? 3),
    relDay: rel === undefined ? undefined : Number(rel),
    dryRun: process.argv.includes("--dry-run"),
  }).catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
}
