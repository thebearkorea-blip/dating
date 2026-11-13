import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { runDailyBatch } from "@/jobs/daily-batch";

export const dynamic = "force-dynamic";

/** Vercel Cron(Authorization: Bearer CRON_SECRET). 로컬 틱(src/tools/daily-tick.ts)과 같은 함수. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const r = await runDailyBatch({ db: getDb() });
  return NextResponse.json({ ok: true, ...r });
}
