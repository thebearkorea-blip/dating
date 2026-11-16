import { immersionMetrics } from "@/admin/metrics";
import { now as clockNow } from "@/clock";
import { getDb } from "@/db/client";
import { getProduct } from "@/product";

const pct = (r: { n: number; hit: number; rate: number | null }) => (r.rate === null ? "-" : `${(r.rate * 100).toFixed(1)}% (${r.hit}/${r.n})`);

export async function ImmersionCard() {
  const m = await immersionMetrics(getDb(), clockNow());
  return (
    <section className="flex flex-col gap-2 rounded border border-[var(--color-line)] p-3 text-sm">
      <h2 className="font-semibold">몰입 지표 — 이 배포의 제품: {getProduct()}</h2>
      <p className="text-[var(--color-ink-soft)]">
        재방문 = 가입 후 app_open 있음(사용자 시간대). 1일 = 1~2일째(가입 3일 이상 경과 n), 7일 = 6~8일째(가입 8일 이상 경과 n). 운영자 계정만 제외(베타 포함).
      </p>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th>가입 주(월)</th>
            <th>1일 재방문</th>
            <th>7일 재방문</th>
          </tr>
        </thead>
        <tbody>
          {m.retention.map((r) => (
            <tr key={r.cohort}>
              <td>{r.cohort}</td>
              <td>{pct(r.d1)}</td>
              <td>{pct(r.d7)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>선톡 24시간 내 답장률(최근 30일, 전달 24시간 경과분): {pct(m.proactive)}</p>
      <p>"봇 같다"류 발화(최근 7일): {m.botLike}건</p>
    </section>
  );
}
