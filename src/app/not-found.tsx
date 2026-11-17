import Link from "next/link";
import { getStrings } from "@/product";

export default function NotFound() {
  const s = getStrings();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">{s["err.notFound.title"]}</h1>
      <p className="text-sm text-[var(--color-ink-soft)]">{s["err.notFound.body"]}</p>
      <Link href="/" className="btn">
        {s["err.notFound.home"]}
      </Link>
    </main>
  );
}
