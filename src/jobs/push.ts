// Web Push 발송. VAPID 키(.env.local)가 없으면 아무것도 하지 않는다. 키·구독 값은 로그에 남기지 않는다.
import { eq } from "drizzle-orm";
import * as wp from "web-push";
import type { Db } from "../db/client";
import { pushSubscriptions } from "../db/schema/index";

// CJS 패키지: 실행 환경(tsx·vitest·webpack)에 따라 default 유무가 다르다.
const webpush: typeof wp = (wp as unknown as { default?: typeof wp }).default ?? wp;

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}
export type PushSender = (db: Db, userId: string, payload: PushPayload) => Promise<number>;

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}

/** 사용자의 모든 구독에 보낸다. 성공 건수를 돌려준다. 만료(404/410) 구독은 지운다. */
export const sendPushToUser: PushSender = async (db, userId, payload) => {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return 0;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@localhost.invalid";
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let ok = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { vapidDetails: { subject, publicKey: pub, privateKey: priv }, TTL: 3600 },
      );
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
    }
  }
  return ok;
};
