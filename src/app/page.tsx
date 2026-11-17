import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { media } from "@/db/schema/index";
import { devOnlyEnabled } from "@/dev-only";
import { characterName } from "@/engine/character-profile";
import { findOwnedRelationship } from "@/engine/chat-view";
import { fmt, getAvatarUrl, getCharacterId, getStrings } from "@/product";

export const dynamic = "force-dynamic";

// 공개(public) 얼굴 사진 1장. 공개 URL(https)이 있을 때만 쓰고, 없거나 조회 실패면 이니셜로 대신한다.
async function publicPhotoUrl(): Promise<string | null> {
  try {
    const rows = await getDb()
      .select({ url: media.blobUrl })
      .from(media)
      .where(and(eq(media.characterId, getCharacterId()), eq(media.audience, "public"), eq(media.face, true)))
      .limit(5);
    return rows.find((r) => /^https?:\/\//.test(r.url))?.url ?? null;
  } catch {
    return null;
  }
}

export default async function Landing() {
  const user = await getCurrentUser();
  if (user) redirect((await findOwnedRelationship(getDb(), user.id)) ? "/chat" : "/onboarding");

  const str = getStrings();
  const name = characterName(null);
  const photo = getAvatarUrl() ?? (await publicPhotoUrl());
  const faq = [1, 2, 3, 4, 5] as const;
  const steps = ["land.step1", "land.step2", "land.step3"] as const;
  const section = "flex flex-col gap-3";
  const card = "rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-6 py-10">
      <header className="flex flex-col items-center gap-4 text-center">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={fmt(str["land.photoAlt"], { name })} className="h-40 w-40 rounded-full object-cover" />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-40 w-40 items-center justify-center rounded-full bg-[var(--color-bubble-his)] text-5xl font-semibold text-[var(--color-bubble-his-ink)]"
          >
            {name.slice(0, 1)}
          </div>
        )}
        <h1 className="text-3xl font-semibold">{str["app.name"]}</h1>
        <p style={{ color: "var(--color-ink-soft)" }}>{fmt(str["land.intro"], { name })}</p>
        <Link href={devOnlyEnabled() ? "/dev-login" : "/sign-up"} className="btn">
          {str["land.start"]}
        </Link>
      </header>

      <section className={section}>
        <h2 className="text-xl font-semibold">{str["land.stepsTitle"]}</h2>
        <ol className="flex flex-col gap-2">
          {steps.map((k, i) => (
            <li key={k} className={`${card} flex gap-3`}>
              <span className="font-semibold" style={{ color: "var(--color-accent)" }}>
                {i + 1}
              </span>
              <span>{str[k]}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={section}>
        <h2 className="text-xl font-semibold">{str["land.pricingTitle"]}</h2>
        <ul className={`${card} flex flex-col gap-1`}>
          <li>{str["land.priceFree"]}</li>
          <li>{str["land.pricePaid"]}</li>
        </ul>
      </section>

      <section className={section}>
        <h2 className="text-xl font-semibold">{str["land.faqTitle"]}</h2>
        {faq.map((n) => (
          <div key={n} className={card}>
            <h3 className="font-semibold">{str[`land.faq${n}.q`]}</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--color-ink-soft)" }}>
              {str[`land.faq${n}.a`]}
            </p>
          </div>
        ))}
      </section>

      <footer className="flex flex-wrap justify-center gap-4 text-sm" style={{ color: "var(--color-ink-soft)" }}>
        <Link href="/legal/terms" className="underline">
          {str["land.footerTerms"]}
        </Link>
        <Link href="/privacy" className="underline">
          {str["land.footerPrivacy"]}
        </Link>
        <Link href="/support" className="underline">
          {str["land.footerSupport"]}
        </Link>
        <Link href="/safety" className="underline">
          {str["land.footerSafety"]}
        </Link>
      </footer>
    </main>
  );
}
