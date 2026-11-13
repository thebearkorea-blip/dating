import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "./require-admin";

export const dynamic = "force-dynamic";

const TABS = [
  ["ratings", "평가"],
  ["review", "검수"],
  ["cost", "비용"],
  ["funnel", "퍼널"],
  ["users", "사용자"],
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
        <h1 className="text-lg font-semibold">Admin</h1>
        <nav className="flex gap-3 text-sm">
          {TABS.map(([k, label]) => (
            <Link key={k} href={`/admin?tab=${k}`} className="underline">
              {label}
            </Link>
          ))}
          <Link href="/chat" className="text-[var(--color-ink-soft)] underline">
            Chat
          </Link>
        </nav>
      </header>
      {children}
    </main>
  );
}
