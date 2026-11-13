// 선톡에 붙일 사진 선택. 매니페스트(world.media)가 비어 있으면 null → 텍스트만 보낸다.
// 같은 사진을 같은 사용자(관계)에게 다시 보내지 않고, audience=private을 먼저 고른다.
import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { media, messages } from "../db/schema/index";
import { hash32 } from "./schedule.js";

export interface PhotoQuery {
  relId: string;
  characterId: string;
  /** 지금 활동/상황 문구. 사진 situation 태그와 부분 일치로 맞춘다. */
  situation: string;
  /** 활동 블록의 photo_tags. 있으면 situation slug 접두어 일치로 맞추고, 없으면 활동명 토큰으로 맞춘다. */
  photoTags?: string[];
  /** morning | noon | afternoon | evening | night */
  timeOfDay: string;
  seed: string;
}

export function timeOfDayOf(minutes: number): string {
  const h = minutes / 60;
  if (h < 11) return "morning";
  if (h < 14) return "noon";
  if (h < 18) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().trim();

function matches(slug: string, sit: string, photoTags: string[] | undefined): boolean {
  if (slug === "") return false;
  if (photoTags && photoTags.length > 0) return photoTags.some((t) => slug.startsWith(norm(t)));
  if (sit.includes(slug) || slug.includes(sit)) return true;
  return sit.split(/[^\p{L}\p{N}-]+/u).some((tok) => tok.length >= 2 && slug.includes(tok));
}

export async function pickPhoto(db: Db, q: PhotoQuery): Promise<string | null> {
  const rows = await db.select().from(media).where(and(eq(media.characterId, q.characterId), eq(media.kind, "photo")));
  if (rows.length === 0) return null;
  const used = new Set(
    (await db.select({ id: messages.mediaId }).from(messages).where(and(eq(messages.relId, q.relId), isNotNull(messages.mediaId)))).map((r) => r.id),
  );
  const sit = norm(q.situation);
  const scored = rows
    .filter((r) => !used.has(r.id))
    .map((r) => {
      const tags = r.tags as { situation?: string; time_of_day?: string };
      const s = norm(tags.situation);
      const situationMatch = matches(s, sit, q.photoTags);
      return { id: r.id, situationMatch, priv: r.audience === "private" ? 1 : 0, tod: norm(tags.time_of_day) === q.timeOfDay ? 1 : 0 };
    })
    .filter((r) => r.situationMatch);
  if (scored.length === 0) return null;
  scored.sort(
    (a, b) => b.priv - a.priv || b.tod - a.tod || hash32(`${q.seed}:${a.id}`) - hash32(`${q.seed}:${b.id}`) || (a.id < b.id ? -1 : 1),
  );
  return (scored[0] as { id: string }).id;
}
