import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { media, messages, relationships } from "@/db/schema/index";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
const PLACEHOLDER =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect width="480" height="360" fill="#d9d9de"/><circle cx="240" cy="160" r="48" fill="#bdbdc6"/><rect x="150" y="230" width="180" height="40" rx="20" fill="#bdbdc6"/></svg>';

/** 이 사용자의 대화에 실제로 실린 사진만 내준다. 로컬은 .data/photos/ 파일, 배포는 Blob URL로 리다이렉트. 파일이 없으면 플레이스홀더. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  const db = getDb();
  const [owned] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(relationships, eq(relationships.id, messages.relId))
    .where(and(eq(messages.mediaId, id), eq(relationships.userId, user.id)))
    .limit(1);
  if (!owned) return new Response(null, { status: 404 });
  const [m] = await db.select({ url: media.blobUrl }).from(media).where(eq(media.id, id)).limit(1);
  if (m && /^https?:\/\//.test(m.url)) return Response.redirect(m.url, 302);
  if (m) {
    const name = basename(m.url);
    const type = TYPES[extname(name).toLowerCase()];
    if (type) {
      try {
        const buf = await readFile(join(".data", "photos", name));
        return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
      } catch {
        // 파일 없음 → 플레이스홀더
      }
    }
  }
  return new Response(PLACEHOLDER, { headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=60" } });
}
