import { devOnlyEnabled } from "@/dev-only";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { now as clockNow } from "@/clock";
import { getDb } from "@/db/client";
import { characters } from "@/db/schema/index";
import { relDayOf } from "@/engine/chat";
import { findOwnedRelationship } from "@/engine/chat-view";
import { himActivity, loadSentPhotos } from "@/engine/him-view";
import { fmt, getStrings } from "@/product";
import { PhotoGrid } from "./PhotoGrid";

export const dynamic = "force-dynamic";

/** bible.md §1 표의 '소속' 칸 첫 구절을 한 줄 소개로 쓴다. 못 찾으면 빈 문자열. */
function tagline(): string {
  try {
    const md = readFileSync(join(process.cwd(), "content/characters/ihan/bible.md"), "utf8");
    const row = md.split("\n").find((l) => l.startsWith("| 소속 |"));
    const cell = row?.split("|")[2] ?? "";
    return (cell.split(",")[0] ?? "").replace(/\([^)]*\)/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

// 프로필 화면. 앱 목소리 박스를 쓰지 않는다. "AI character"는 프로필 메타 정보로 상시 표시한다.
export default async function Him() {
  const user = await getCurrentUser();
  if (!user) redirect(devOnlyEnabled() ? "/dev-login" : "/sign-in");
  const [c] = await getDb().select().from(characters).where(eq(characters.id, "ihan")).limit(1);
  if (!c) redirect("/chat");
  const str = getStrings();
  const now = clockNow();
  const rel = await findOwnedRelationship(getDb(), user.id);
  const photos = rel ? await loadSentPhotos(getDb(), rel.id, now) : [];
  const relDay = rel ? await relDayOf(getDb()) : 0;
  const days = -relDay;
  const debutLine = !rel || days < 0 ? null : days === 0 ? str["him.debutToday"] : days === 1 ? str["him.debutTomorrow"] : fmt(str["him.debutIn"], { days });
  const activity = rel ? await himActivity(getDb(), rel, now) : "";
  const position = ((c.bible as { position?: string[] }).position ?? []).join(" · ");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{str["him.title"]}</h1>
        <Link href="/chat" className="text-sm underline">
          {str["header.back"]}
        </Link>
      </header>
      <div
        aria-hidden="true"
        className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-[var(--color-bubble-his)] text-4xl font-semibold text-[var(--color-bubble-his-ink)]"
      >
        {c.name.slice(0, 1)}
      </div>
      <section className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">{c.name}</h2>
          <span data-profile-meta="ai-character" className="rounded-[var(--radius-control)] border border-[var(--color-line)] px-2 py-0.5 text-xs text-[var(--color-ink-soft)]">
            {str["him.aiTag"]}
          </span>
        </div>
        <p className="text-[var(--color-ink-soft)]">{tagline()}</p>
        {debutLine ? <p className="text-sm font-medium">{debutLine}</p> : null}
        {activity ? (
          <p className="text-sm text-[var(--color-ink-soft)]">
            {str["him.today"]}: {activity}
          </p>
        ) : null}
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-[var(--color-ink-soft)]">{str["him.group"]}</dt>
          <dd>{c.groupName}</dd>
          <dt className="text-[var(--color-ink-soft)]">{str["him.position"]}</dt>
          <dd>{position}</dd>
          <dt className="text-[var(--color-ink-soft)]">{str["him.age"]}</dt>
          <dd>{c.age}</dd>
        </dl>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{fmt(str["him.photos"], { name: c.name })}</h2>
        {photos.length > 0 ? (
          <PhotoGrid mediaIds={photos.map((p) => p.mediaId)} alt={fmt(str["photo.alt"], { name: c.name })} closeLabel={str["photo.close"]} />
        ) : (
          <p className="text-sm text-[var(--color-ink-soft)]">{str["him.noPhotos"]}</p>
        )}
      </section>
    </main>
  );
}
