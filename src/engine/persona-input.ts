// 페르소나 재료 조립. 답장(chat.ts)·선톡(proactive.ts)·persona-regress가 같은 재료로 buildPersona를 부르도록 한 곳에 둔다.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { groupSchema, timelineSchema, type Bible, type CanonRow, type Group } from "../content/schemas/index.js";
import type { PersonaInput } from "./persona.js";
import { formatNowKst, upcomingBlocks, type Activity, type EngineCharacter } from "./schedule.js";

/** content/world에서 id가 맞는 그룹 파일. 없으면 undefined. */
export function loadGroupFile(contentRoot: string, groupId: string): Group | undefined {
  const dir = join(contentRoot, "world");
  return readdirSync(dir)
    .filter((f) => /^group.*\.yaml$/.test(f))
    .map((f) => groupSchema.parse(parseYaml(readFileSync(join(dir, f), "utf8"))))
    .find((g) => g.id === groupId);
}

/** 캐릭터 전용 timeline-{id}.yaml, 없으면 공용 timeline.yaml. */
export function loadTimelineFile(contentRoot: string, characterId: string): EngineCharacter["timeline"] {
  const own = join(contentRoot, "world", `timeline-${characterId}.yaml`);
  return timelineSchema.parse(parseYaml(readFileSync(existsSync(own) ? own : join(contentRoot, "world/timeline.yaml"), "utf8")));
}

export interface PersonaAssembly {
  bible: Bible;
  group: Group | undefined;
  voiceMd: string;
  canon: CanonRow[];
  engine: EngineCharacter;
  activity: Activity;
  now: Date;
  relDay: number;
  stage: number;
  /** 호출자별 추가 재료(기억·프로필·토라짐·비밀 등) */
  extra?: Pick<PersonaInput, "memories" | "profile" | "sulk" | "secretNow" | "disclosed">;
}

/** buildPersona 입력을 만든다(순수): 현재 시각 문자열과 앞으로 24시간 일정을 같은 식으로 붙인다. */
export function assemblePersonaInput(a: PersonaAssembly): PersonaInput {
  return {
    bible: a.bible,
    group: a.group,
    voiceMd: a.voiceMd,
    canon: a.canon,
    activity: a.activity,
    nowKst: formatNowKst(a.now),
    upcoming: upcomingBlocks(a.engine, a.now, { relDay: a.relDay, stage: a.stage }),
    stage: a.stage,
    ...a.extra,
  };
}
