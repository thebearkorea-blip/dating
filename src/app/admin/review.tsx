import { reviewSummary } from "@/admin/queries";
import { getDb } from "@/db/client";

export async function ReviewTab() {
  const { recent, byRule } = await reviewSummary(getDb());
  return (
    <div className="flex flex-col gap-4 text-sm">
      <section>
        <h2 className="mb-1 font-semibold">rule_id별</h2>
        <table className="w-full text-left">
          <tbody>
            {byRule.map((r) => (
              <tr key={r.ruleId}>
                <td className="py-0.5">{r.ruleId}</td>
                <td className="py-0.5">{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="mb-1 font-semibold">최근 {recent.length}건</h2>
        <ul className="flex flex-col gap-2">
          {recent.map((f) => (
            <li key={f.id} className="rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-2">
              <p className="text-[var(--color-ink-soft)]">
                {f.severity} · {f.ruleId} · {f.at.toISOString().slice(0, 16).replace("T", " ")}
              </p>
              {f.quote ? <p>&ldquo;{f.quote}&rdquo;</p> : null}
              <p className="text-[var(--color-ink-soft)]">{f.reason}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
