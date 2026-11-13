// 사용법: node --import tsx src/tools/proactive-tick.ts [--now ISO] [--loop 900]
// 선톡 틱 1회(또는 N초마다 반복). Vercel Cron 라우트(/api/cron/proactive)와 같은 함수를 부른다.
import { closeDb, getDb } from "../db/client";
import { runProactiveTick } from "../jobs/proactive.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const nowArg = arg("now");
const loopSec = Number(arg("loop") ?? "0");
if (nowArg && Number.isNaN(new Date(nowArg).getTime())) throw new Error(`--now 값이 날짜가 아님: ${nowArg}`);

async function tick(): Promise<void> {
  const now = nowArg ? new Date(nowArg) : new Date();
  const r = await runProactiveTick({ db: getDb(), now });
  console.log(`[${now.toISOString()}] relationships=${r.relationships} candidates=${r.candidates} saved=${r.saved} skipped=${r.skipped} pushed=${r.pushed}`);
}

if (loopSec > 0) {
  for (;;) {
    await tick();
    await new Promise((res) => setTimeout(res, loopSec * 1000));
  }
} else {
  await tick();
  await closeDb();
}
