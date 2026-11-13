import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { characters } from "@/db/schema/index";

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
  if (!user) redirect("/dev-login");
  const [c] = await getDb().select().from(characters).where(eq(characters.id, "ihan")).limit(1);
  if (!c) redirect("/chat");
  const position = ((c.bible as { position?: string[] }).position ?? []).join(" · ");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Profile</h1>
        <Link href="/chat" className="text-sm underline">
          Back
        </Link>
      </header>
      <div
        role="img"
        aria-label="Photo placeholder"
        className="flex aspect-square w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]"
      >
        Photo
      </div>
      <section className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">{c.name}</h2>
          <span data-profile-meta="ai-character" className="rounded-[var(--radius-control)] border border-[var(--color-line)] px-2 py-0.5 text-xs text-[var(--color-ink-soft)]">
            AI character
          </span>
        </div>
        <p className="text-[var(--color-ink-soft)]">{tagline()}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-[var(--color-ink-soft)]">Group</dt>
          <dd>{c.groupName}</dd>
          <dt className="text-[var(--color-ink-soft)]">Position</dt>
          <dd>{position}</dd>
          <dt className="text-[var(--color-ink-soft)]">Age</dt>
          <dd>{c.age}</dd>
        </dl>
      </section>
    </main>
  );
}
