// 사용법: node --import tsx src/tools/persona-preview.ts <YYYY-MM-DD> [KST 시각 HH:MM=12:00] [relDay=-150] [stage=2]
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  bibleSchema,
  canonRowSchema,
  scheduleSchema,
  timelineSchema,
  type CanonRow,
} from "../content/schemas/index.js";
import { activityAt } from "../engine/schedule.js";
import { buildPersona } from "../engine/persona.js";

const [date, hm = "12:00", rel = "-150", st = "2"] = process.argv.slice(2);
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("usage: persona-preview.ts <YYYY-MM-DD> [HH:MM KST] [relDay] [stage]");
  process.exit(2);
}

const root = resolve("content");
const yaml = (p: string): unknown => parseYaml(readFileSync(resolve(root, p), "utf8"));
const bible = bibleSchema.parse(yaml("characters/ihan/bible.yaml"));
const schedule = scheduleSchema.parse(yaml("characters/ihan/schedule.yaml"));
const timeline = timelineSchema.parse(yaml("world/timeline.yaml"));
const voiceMd = readFileSync(resolve(root, "characters/ihan/voice.md"), "utf8");
const canonPath = resolve(root, "world/canon.jsonl");
const canon: CanonRow[] = existsSync(canonPath)
  ? readFileSync(canonPath, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => canonRowSchema.parse(JSON.parse(l)))
  : [];

// KST → UTC
const worldTime = new Date(`${date}T${hm}:00+09:00`);
const stage = Number(st);
const activity = activityAt(
  { id: bible.id, schedule, timeline, affectionStages: bible.affection_stages },
  worldTime,
  { relDay: Number(rel), stage },
);
const persona = buildPersona({ bible, voiceMd, canon, activity, stage });

console.log(`시각(KST): ${date} ${hm} / 애정 단계 ${stage} / relDay ${rel}`);
console.log(`활동: ${activity.activity} (${activity.kind}${activity.tags.length ? `: ${activity.tags.join(",")}` : ""})`);
console.log(`busy: ${activity.busy} / 기분: ${activity.mood} / 선톡 가능: ${activity.canInitiate}`);
console.log(`답장 지연(분): ${activity.replyDelayRange.min}~${activity.replyDelayRange.max}`);
console.log(
  `토큰 추정: 전체 ${persona.tokens_estimate} (prefix ${Math.ceil(persona.cacheable_prefix.length / 4)}, suffix ${Math.ceil(persona.dynamic_suffix.length / 4)})`,
);
