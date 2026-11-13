import { ratingRows } from "@/admin/queries";
import { getDb } from "@/db/client";

export async function RatingsTab() {
  const rows = await ratingRows(getDb());
  if (rows.length === 0) return <p className="text-sm text-[var(--color-ink-soft)]">평가 없음</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.id} className="rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-sm">
          <p className="text-[var(--color-ink-soft)]">
            {r.score === 1 ? "👍" : "👎"} · stage {r.stage} · {r.at.toISOString().slice(0, 16).replace("T", " ")}
          </p>
          {r.prevUserText ? <p className="mt-1 text-[var(--color-ink-soft)]">user: {r.prevUserText}</p> : null}
          <p className="mt-1">him: {r.messageText}</p>
          {r.note ? <p className="mt-1 font-medium">memo: {r.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}
