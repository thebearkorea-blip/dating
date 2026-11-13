// 사용법: node --import tsx src/tools/daily-tick.ts [--now ISO]
// 일 배치 1회(애정 감쇠·토라짐 전이·프로필 굳히기). --now로 시각을 당겨 3일 공백 등을 재현한다.
import { closeDb, getDb } from "../db/client";
import { runDailyAffection } from "../jobs/daily-affection.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const nowArg = arg("now");
if (nowArg && Number.isNaN(new Date(nowArg).getTime())) throw new Error(`--now 값이 날짜가 아님: ${nowArg}`);
const now = nowArg ? new Date(nowArg) : new Date();
const r = await runDailyAffection({ db: getDb(), now });
console.log(`[${now.toISOString()}] relationships=${r.relationships} decayed=${r.decayed} sulkEntered=${r.sulkEntered} frozen=${r.frozen}`);
await closeDb();
