// 사용법: node --import tsx src/db/load-content.ts [contentDir=content]
// content/ → world.* upsert. 멱등(재실행해도 행 수가 늘지 않는다).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { count } from "drizzle-orm";
import { parse as parseYaml } from "yaml";
import {
  bibleSchema,
  canonRowSchema,
  groupSchema,
  photoRowSchema,
  scheduleSchema,
} from "../content/schemas/index";
import { closeDb, getDb, type Db } from "./client";
import { canonFacts, characters, media } from "./schema/index";

function jsonl(path: string): unknown[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

export async function loadContent(db: Db, root: string): Promise<{ characters: number; canon: number; media: number }> {
  // world/group.yaml, world/group-*.yaml(예: group-halftone.yaml)를 모두 읽는다. 캐릭터는 bible.group_id로 짝짓는다.
  const groups = readdirSync(join(root, "world"))
    .filter((f) => /^group(-.+)?\.yaml$/.test(f))
    .map((f) => groupSchema.parse(parseYaml(readFileSync(join(root, "world", f), "utf8"))));

  const charsDir = join(root, "characters");
  for (const id of readdirSync(charsDir)) {
    const dir = join(charsDir, id);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(join(dir, "bible.yaml"))) continue; // 후보 사진만 있는 캐릭터 폴더는 건너뛴다
    const bible = bibleSchema.parse(parseYaml(readFileSync(join(dir, "bible.yaml"), "utf8")));
    const schedule = scheduleSchema.parse(parseYaml(readFileSync(join(dir, "schedule.yaml"), "utf8")));
    const voiceMd = readFileSync(join(dir, "voice.md"), "utf8");
    const group = groups.find((g) => g.id === bible.group_id);
    const member = group?.members.find((m) => m.id === bible.id);
    if (!group || !member) throw new Error(`group 파일에 멤버 없음: ${bible.group_id}/${bible.id}`);
    const { id: _id, ...rest } = {
      id: bible.id,
      groupId: group.id,
      groupName: group.name,
      name: bible.name,
      nameEn: member.name_en,
      age: bible.age,
      role: member.role ?? null,
      bible,
      voiceMd,
      schedule,
    };
    await db
      .insert(characters)
      .values({ id: bible.id, ...rest })
      .onConflictDoUpdate({ target: characters.id, set: rest });

    for (const raw of jsonl(join(dir, "photos/manifest.jsonl"))) {
      const p = photoRowSchema.parse(raw);
      if (p.used.some((u) => u.where === "rejected")) continue; // 검수에서 탈락한 사진은 적재하지 않는다
      const mRest = {
        characterId: bible.id,
        kind: "photo",
        tags: { situation: p.situation, time_of_day: p.time_of_day, place: p.place, face: p.face },
        audience: p.audience,
        face: p.face,
        blobUrl: p.blob_url,
      };
      await db
        .insert(media)
        .values({ id: p.id, ...mRest })
        .onConflictDoUpdate({ target: media.id, set: mRest });
    }
  }

  for (const raw of jsonl(join(root, "world/canon.jsonl"))) {
    const c = canonRowSchema.parse(raw);
    await db
      .insert(canonFacts)
      .values({ at: c.at, character: c.character, fact: c.fact, source: c.source, eventId: c.event_id ?? null })
      .onConflictDoNothing();
  }

  const [ch] = await db.select({ n: count() }).from(characters);
  const [cf] = await db.select({ n: count() }).from(canonFacts);
  const [md] = await db.select({ n: count() }).from(media);
  return { characters: ch?.n ?? 0, canon: cf?.n ?? 0, media: md?.n ?? 0 };
}

// 직접 실행했을 때만 돈다(import 시에는 실행하지 않음).
if (import.meta.url === `file://${resolve(process.argv[1] ?? "")}`) {
  const root = resolve(process.argv[2] ?? "content");
  const r = await loadContent(getDb(), root);
  console.log(`world.characters ${r.characters}행, canon_facts ${r.canon}행, media ${r.media}행`);
  await closeDb();
}
