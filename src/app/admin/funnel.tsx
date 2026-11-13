import { funnel } from "@/admin/queries";
import { getDb } from "@/db/client";

const pct = (r: number | null) => (r === null ? "-" : `${(r * 100).toFixed(1)}%`);

export async function FunnelTab() {
  const { steps, extra } = await funnel(getDb());
  return (
    <div className="flex flex-col gap-4 text-sm">
      <table className="w-full text-left">
        <thead>
          <tr>
            <th>단계</th>
            <th>사용자</th>
            <th>직전 대비</th>
            <th>가입 대비</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td>{s.count}</td>
              <td>{pct(s.fromPrev)}</td>
              <td>{pct(s.fromSignup)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[var(--color-ink-soft)]">
        기타: {["invite_link_open", "quota_exhausted", "paywall_shown", "cancel", "breakup", "reconcile"].map((k) => `${k} ${extra[k] ?? 0}`).join(" · ")}
      </p>
    </div>
  );
}
