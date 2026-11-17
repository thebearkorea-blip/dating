"use client";

import { getStrings } from "@/product";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const s = getStrings();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">{s["err.error.title"]}</h1>
      <p className="text-sm text-[var(--color-ink-soft)]">{s["err.error.body"]}</p>
      <button type="button" onClick={reset} className="btn">
        {s["err.error.retry"]}
      </button>
    </main>
  );
}
