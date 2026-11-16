// 첫 7일 장면표(user_day_N)와 첫 접속 장면(first_open_*) 소비. 장면 대본은 scenes/*.md, 발송 여부는 messages.tag = `scene:<id>`로 관계마다 한 번만.
import { and, asc, eq, isNull, like } from "drizzle-orm";
import type { Db } from "../db/client";
import { memories, messages, users } from "../db/schema/index";
import { dayKey } from "../product/index.js";
import { loadScenes, type Scene } from "./scenes.js";

export const sceneTag = (s: Scene): string => `scene:${s.id}`;

/** 관계 시작일을 1일째로 센 사용자 시간대 기준 N일째. */
export function userDayOf(startedAt: Date, now: Date, tz: string): number {
  const ms = (k: string) => Date.parse(`${k}T00:00:00Z`);
  return Math.round((ms(dayKey(now, tz)) - ms(dayKey(startedAt, tz))) / 86400000) + 1;
}

/** trigger가 user_day_N 또는 user_day_N_<꼬리>(예: user_day_2_proactive, user_day_7_letter)인 장면. */
export function userDayScenes(characterId: string, day: number, root = "content"): Scene[] {
  const re = new RegExp(`^user_day_${day}(_.+)?$`);
  return loadScenes(characterId, root).filter((s) => re.test(s.trigger));
}

/** `{{키}}`를 채운다. 값이 없는 키가 남은 줄은 지운다. {{photo}}는 호출부가 처리하므로 건드리지 않는다. 빈 말풍선은 버린다. */
export function fillScene(bubbles: string[], vars: Record<string, string | null | undefined>): string[] {
  const out: string[] = [];
  for (const b of bubbles) {
    const lines = b
      .split("\n")
      .map((line) => line.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k === "photo" ? m : (vars[k] ?? m))))
      .filter((line) => !/\{\{(?!photo\})\w+\}\}/.test(line));
    const text = lines.join("\n").trim();
    if (text) out.push(text);
  }
  return out;
}

export interface PendingScene {
  scene: Scene;
  bubbles: string[];
  tag: string;
}

/** 오늘이 관계 N일째이고 아직 보내지 않은 user_day_N 장면 1개(id 순). 없으면 null. */
export async function pendingUserDayScene(
  db: Db,
  rel: { id: string; userId: string; stage: number; startedAt: Date },
  characterId: string,
  now: Date,
): Promise<PendingScene | null> {
  const [u] = await db.select({ tz: users.tz, name: users.displayName }).from(users).where(eq(users.id, rel.userId)).limit(1);
  const day = userDayOf(rel.startedAt, now, u?.tz || "Asia/Seoul");
  const scenes = userDayScenes(characterId, day).filter((s) => s.stageMin <= rel.stage);
  if (scenes.length === 0) return null;
  const sent = new Set(
    (await db.select({ tag: messages.tag }).from(messages).where(and(eq(messages.relId, rel.id), like(messages.tag, "scene:%")))).map((r) => r.tag),
  );
  const scene = scenes.find((s) => !sent.has(sceneTag(s)));
  if (!scene) return null;
  const mems = await db
    .select({ fact: memories.fact })
    .from(memories)
    .where(and(eq(memories.relId, rel.id), isNull(memories.deletedAt)))
    .orderBy(asc(memories.learnedAt), asc(memories.id))
    .limit(3);
  const vars: Record<string, string | null | undefined> = { user_name: u?.name, memory_1: mems[0]?.fact, memory_2: mems[1]?.fact, memory_3: mems[2]?.fact };
  return { scene, bubbles: fillScene(scene.bubbles, vars), tag: sceneTag(scene) };
}

/** 첫 접속 장면: 초대 링크로 들어왔으면 via_link(없으면 via_tiktok_link), 아니면 direct. 대본이 없으면 null. */
export function firstOpenScene(characterId: string, viaLink: boolean, root = "content"): Scene | null {
  const all = loadScenes(characterId, root);
  const order = viaLink ? ["first_open_via_link", "first_open_via_tiktok_link", "first_open_direct"] : ["first_open_direct"];
  for (const trigger of order) {
    const s = all.find((x) => x.trigger === trigger && x.stageMin <= 1);
    if (s) return s;
  }
  return null;
}
