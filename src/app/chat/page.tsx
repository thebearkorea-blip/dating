import { devOnlyEnabled } from "@/dev-only";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { now as clockNow } from "@/clock";
import Link from "next/link";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { takePaywall } from "@/billing/paywall";
import { getDb } from "@/db/client";
import { activityLine, currentActivity, nextDeliverAt } from "@/engine/chat";
import { reconcileStatus } from "@/engine/reconcile";
import { maybeDay3Return } from "@/engine/events";
import { messages, ratings, relationships } from "@/db/schema/index";
import { AppVoice } from "../_components/AppVoice";
import { DevBanner } from "../_components/DevBanner";
import { Composer } from "./Composer";
import { DeliveryTimer } from "./DeliveryTimer";
import { Rate } from "./Rate";
import { ReconcileForm } from "./ReconcileForm";

export const dynamic = "force-dynamic";

/** 보낸 뒤 이 시간 안에 답장 행이 안 생기면 다시 불러오기를 멈춘다. */
const AWAIT_REPLY_MS = 2 * 60000;
const AWAIT_POLL_MS = 3000;

function safeTz(tz: string | null): string {
  const t = tz || "Asia/Seoul";
  try {
    new Intl.DateTimeFormat("en", { timeZone: t });
    return t;
  } catch {
    return "Asia/Seoul";
  }
}

export default async function Chat() {
  const user = await getCurrentUser();
  if (!user) redirect(devOnlyEnabled() ? "/dev-login" : "/sign-in");
  const db = getDb();
  // 숨김 컬럼은 선택하지 않는다(화면·DTO에 싣지 않음).
  const [rel] = await db
    .select({ id: relationships.id, stage: relationships.stage })
    .from(relationships)
    .where(and(eq(relationships.userId, user.id), eq(relationships.characterId, "ihan")))
    .limit(1);
  if (!rel) redirect("/onboarding");

  const now = clockNow();
  await maybeDay3Return(db, user, now);
  if (await takePaywall(db, user.id, now)) redirect("/paywall");
  const rows = await db
    .select({ id: messages.id, sender: messages.sender, text: messages.text, mediaId: messages.mediaId, at: messages.at, deliverAt: messages.deliverAt })
    .from(messages)
    .where(and(eq(messages.relId, rel.id), lte(messages.deliverAt, now)))
    .orderBy(desc(messages.at), desc(sql`case when ${messages.sender} = 'user' then 0 else 1 end`), desc(messages.id))
    .limit(100);
  // 빈 텍스트(사진 없음)는 렌더하지 않는다.
  const list = rows.reverse().filter((m) => m.text.trim() || m.mediaId);
  // 평가 UI는 베타 테스터에게만. 비베타는 평가 데이터도 읽지 않는다.
  const mine = new Map<string, 1 | -1>();
  if (user.isBeta) {
    for (const r of await db.select({ msgId: ratings.msgId, score: ratings.score }).from(ratings).where(eq(ratings.userId, user.id))) {
      mine.set(r.msgId, r.score === 1 ? 1 : -1);
    }
  }
  const tz = safeTz(user.tz);
  const hm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
  const dayFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", weekday: "short", timeZone: tz });
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const next = await nextDeliverAt(db, rel.id, now);
  const status = await reconcileStatus(db, rel.id, now);
  const line = activityLine(await currentActivity(db, rel.stage, now));
  // 답장 생성은 전송 응답 뒤에 돈다(after). 방금 보낸 말 뒤에 아직 저장된 답장이 없으면 잠시 다시 불러온다.
  const last = list.at(-1);
  const awaiting = !next && last?.sender === "user" && now.getTime() - last.at.getTime() < AWAIT_REPLY_MS;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <DevBanner />
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <Link href="/him" className="text-sm text-[var(--color-ink-soft)] underline">
          {line}
        </Link>
        <span className="flex gap-3">
          <Link href="/me" className="text-sm underline">
            Memories
          </Link>
          <Link href="/settings" className="text-sm underline">
            Settings
          </Link>
        </span>
      </header>
      {/* 입력창이 있으면 빈 공간은 Composer가 채운다(보낸 말풍선이 목록 바로 뒤에 붙도록). */}
      <ul className={status === "active" ? "flex flex-col gap-2 p-4" : "flex flex-1 flex-col gap-2 p-4"}>
        {list.map((m, i) => {
          const d = dayKey.format(m.deliverAt);
          const newDay = i === 0 || d !== dayKey.format(list[i - 1]!.deliverAt);
          const dayLabel = (() => {
            const parts = dayFmt.formatToParts(m.deliverAt);
            const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
            return `${g("month")} ${g("day")} (${g("weekday")})`;
          })();
          return (
          <Fragment key={m.id}>
          {newDay ? <li className="text-center text-xs text-[var(--color-ink-soft)]">{dayLabel}</li> : null}
          <li
            className={
              m.sender === "user"
                ? "ml-auto max-w-[80%] rounded-[var(--radius-bubble-mine)] bg-[var(--color-bubble-mine)] px-4 py-2 text-[var(--color-bubble-mine-ink)]"
                : "mr-auto max-w-[80%] rounded-[var(--radius-bubble)] bg-[var(--color-bubble-his)] px-4 py-2 text-[var(--color-bubble-his-ink)]"
            }
          >
            {m.mediaId ? <img src={`/api/media/${m.mediaId}`} alt="" className="mb-2 w-full rounded-[var(--radius-control)]" /> : null}
            {m.text}
            {user.isBeta && m.sender === "char" ? <Rate msgId={m.id} initial={mine.get(m.id) ?? null} /> : null}
          </li>
          <li className={`-mt-1 text-xs text-[var(--color-ink-soft)] ${m.sender === "user" ? "ml-auto" : "mr-auto"}`}>{hm.format(m.deliverAt)}</li>
          </Fragment>
          );
        })}
      </ul>
      {next ? (
        <DeliveryTimer at={next.toISOString()} />
      ) : awaiting ? (
        <DeliveryTimer at={new Date(now.getTime() + AWAIT_POLL_MS).toISOString()} />
      ) : null}
      {status === "active" ? (
        <Composer tz={tz} />
      ) : (
        <AppVoice screen="reconcile">
          <ReconcileForm open={status === "open"} />
        </AppVoice>
      )}
    </main>
  );
}
