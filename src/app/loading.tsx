import { getStrings } from "@/product";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center justify-center px-6">
      <p role="status" className="text-sm text-[var(--color-ink-soft)]">
        {getStrings()["err.loading"]}
      </p>
    </main>
  );
}
