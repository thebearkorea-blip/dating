import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { runProactiveTick } from "@/jobs/proactive";

export const dynamic = "force-dynamic";

/** Vercel Cron(Authorization: Bearer CRON_SECRET). 로컬 틱(src/tools/proactive-tick.ts)과 같은 함수. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const r = await runProactiveTick({ db: getDb() });
  return NextResponse.json({ ok: true, ...r });
}
