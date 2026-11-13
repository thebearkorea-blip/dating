import { index, integer, jsonb, pgSchema, serial, text, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";

export const world = pgSchema("world");

/** content/characters/<id>/ 적재본(bible·voice·schedule 원문 포함) */
export const characters = world.table("characters", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  groupName: text("group_name").notNull(),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull(),
  age: integer("age").notNull(),
  role: text("role"),
  bible: jsonb("bible").notNull(),
  voiceMd: text("voice_md").notNull(),
  schedule: jsonb("schedule").notNull(),
});

/** content/world/canon.jsonl 적재본. (at, character, fact)가 유일 키라 재적재해도 중복되지 않는다. */
export const canonFacts = world.table(
  "canon_facts",
  {
    id: serial("id").primaryKey(),
    at: text("at").notNull(),
    character: text("character").notNull(),
    fact: text("fact").notNull(),
    source: text("source").notNull(),
    eventId: text("event_id"),
  },
  (t) => [uniqueIndex("canon_facts_uq").on(t.at, t.character, t.fact)],
);

/** photos/manifest.jsonl 적재본 */
export const media = world.table(
  "media",
  {
    id: text("id").primaryKey(),
    characterId: text("character_id").notNull(),
    kind: text("kind").notNull().default("photo"),
    tags: jsonb("tags").notNull(),
    audience: text("audience").notNull(),
    face: boolean("face").notNull(),
    blobUrl: text("blob_url").notNull(),
  },
  (t) => [index("media_character_idx").on(t.characterId)],
);

/** 정의만(첫 출시에서는 쓰지 않음) */
export const worldEvents = world.table("world_events", {
  id: text("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  canon: jsonb("canon"),
  source: text("source").notNull(), // script | branch
  relDay: integer("rel_day"),
  timelineBeatId: text("timeline_beat_id"),
});
