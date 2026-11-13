import Link from "next/link";

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-3xl font-semibold">He&apos;s here.</p>
      <p style={{ color: "var(--color-ink-soft)" }}>그가 여기 있어.</p>
      <Link href="/dev-login" className="btn">
        Start
      </Link>
    </main>
  );
}
