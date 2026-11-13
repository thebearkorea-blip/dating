// 비밀 해금: 단계 상승으로 대기(pending_secret)된 비밀 1개를 "밤 시간(사용자 tz 22~01시)" 또는 "사용자가 힘들다고 한 뒤"의
// 답장 프롬프트에 1회 지시하고 disclosures에 기록한다. 대기·해금 판단은 affection.ts, 여기는 말할 때의 판정.
import { eq } from "drizzle-orm";
import type { Bible } from "../content/schemas/index.js";
import type { Db } from "../db/client";
import { disclosures, relationships } from "../db/schema/index";

const STRUGGLE = /힘들|지쳤|tired|exhaust|struggl|rough (day|week)|stressed|burn(ed|t) ?out|overwhelm|can'?t (do|take) (this|it)/i;

/** 사용자 시간대 현지 시(0~23). tz가 잘못되면 null. */
function localHour(now: Date, tz: string): number | null {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now);
    return Number(h);
  } catch {
    return null;
  }
}

/** 22시 이상 또는 0~1시 전(= 22~01시). */
export function isNightHour(h: number | null): boolean {
  return h !== null && (h >= 22 || h < 1);
}

/** 지금 말해도 되는 대기 비밀(없으면 null). 기록은 하지 않는다. */
export async function peekSecret(db: Db, relId: string, bible: Bible, now: Date, tz: string | null, userText: string): Promise<{ id: string; text: string } | null> {
  const [r] = await db.select({ p: relationships.pendingSecret }).from(relationships).where(eq(relationships.id, relId)).limit(1);
  if (!r?.p) return null;
  if (!isNightHour(localHour(now, tz || "Asia/Seoul")) && !STRUGGLE.test(userText)) return null;
  const s = bible.secrets.find((x) => x.id === r.p);
  return s ? { id: s.id, text: s.text } : null;
}

/** 말했다고 기록하고 대기를 비운다. */
export async function recordDisclosure(db: Db, relId: string, secretId: string): Promise<void> {
  await db.insert(disclosures).values({ relId, secretId }).onConflictDoNothing();
  await db.update(relationships).set({ pendingSecret: null }).where(eq(relationships.id, relId));
}
