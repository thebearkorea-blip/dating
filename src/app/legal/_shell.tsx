// 初稿 — 専門家確認前 (일본판 법정 페이지 3종: 초안. 공개 전 일본 법무 전문가 확인 필수. J5)
import Link from "next/link";
import type { ReactNode } from "react";
import { devOnlyEnabled } from "@/dev-only";

/** 사용자가 채워야 하는 자리표시자. */
export const PH = "【要記入】";

export function hasPlaceholder(values: string[]): boolean {
  return values.some((v) => v.includes(PH));
}

/** 법정 페이지 공통 틀. 자리표시자가 남아 있으면 개발 모드에서만 경고 배너를 보인다. */
export function LegalShell({ title, placeholders, children }: { title: string; placeholders: string[]; children: ReactNode }) {
  const warn = devOnlyEnabled() && hasPlaceholder(placeholders);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{title}</h1>
        <Link href="/settings" className="text-sm underline">
          戻る
        </Link>
      </header>
      {warn ? (
        <p role="alert" className="border border-red-500 p-2 text-sm text-red-600">
          [開発用警告] 【要記入】の項目が残っています。公開前に必ず記入し、専門家の確認を受けてください(本番ビルドでは表示されません)。
        </p>
      ) : null}
      {children}
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}
