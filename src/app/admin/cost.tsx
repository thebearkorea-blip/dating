import Link from "next/link";
import { costSummary } from "@/admin/queries";
import { getDb } from "@/db/client";

const usd = (n: number) => `$${n.toFixed(4)}`;

export async function CostTab({ days }: { days: number }) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const { byPurposeModel, total, monthly } = await costSummary(getDb(), from, to);
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="flex gap-3">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/admin?tab=cost&days=${d}`} className={d === days ? "font-bold underline" : "underline"}>
            {d}d
          </Link>
        ))}
      </p>
      <section>
        <h2 className="mb-1 font-semibold">purpose · model (합계 {usd(total)})</h2>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>purpose</th>
              <th>model</th>
              <th>calls</th>
              <th>input</th>
              <th>output</th>
              <th>USD</th>
            </tr>
          </thead>
          <tbody>
            {byPurposeModel.map((r) => (
              <tr key={`${r.purpose}/${r.model}`}>
                <td>{r.purpose}</td>
                <td>{r.model}</td>
                <td>{r.calls}</td>
                <td>{r.input}</td>
                <td>{r.output}</td>
                <td>{usd(r.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="mb-1 font-semibold">사용자당 월 평균 원가</h2>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>month</th>
              <th>users</th>
              <th>total</th>
              <th>per user</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.month}>
                <td>{m.month}</td>
                <td>{m.users}</td>
                <td>{usd(m.cost)}</td>
                <td>{m.perUser === null ? "-" : usd(m.perUser)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
