import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { bibleSchema, groupSchema, scheduleSchema, timelineSchema } from "../../src/content/schemas/index.js";
import type { EngineCharacter } from "../../src/engine/schedule.js";

const C = join(import.meta.dirname, "../../content");
const y = (p: string): unknown => parse(readFileSync(join(C, p), "utf8"));

export const bible = bibleSchema.parse(y("characters/ihan/bible.yaml"));
export const group = groupSchema.parse(y("world/group.yaml"));
export const timeline = timelineSchema.parse(y("world/timeline.yaml"));
export const voiceMd = readFileSync(join(C, "characters/ihan/voice.md"), "utf8");
export const character: EngineCharacter = {
  id: bible.id,
  schedule: scheduleSchema.parse(y("characters/ihan/schedule.yaml")),
  timeline,
  affectionStages: bible.affection_stages,
};
