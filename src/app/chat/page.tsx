import { devOnlyEnabled } from "@/dev-only";
import { and, eq } from "drizzle-orm";
import { now as clockNow } from "@/clock";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { takePaywall } from "@/billing/paywall";
import { getDb } from "@/db/client";
import { isUuid, loadChatMeta, loadMessages } from "@/engine/chat-view";
import { reconcileStatus } from "@/engine/reconcile";
import { maybeDay3Return } from "@/engine/events";
import { characters, ratings, relationships } from "@/db/schema/index";
import { AppVoice } from "../_components/AppVoice";
import { DevBanner } from "../_components/DevBanner";
import { characterName } from "@/engine/character-profile";
import { chatFormat, chatListStrings, getCharacterId, getProduct, getStrings, fmt, replyStripStrings, safeTz } from "@/product";
import { ChatClient } from "./ChatClient";
import { ChatViewport } from "./Composer";
import { ReconcileForm } from "./ReconcileForm";

export const dynamic = "force-dynamic";

export default async function Chat({ searchParams }: { searchParams: Promise<{ around?: string | string[] }> }) {
  const product = getProduct();
  const str = getStrings(product);
  const characterId = getCharacterId(product);
  const user = await getCurrentUser();
  if (!user) redirect(devOnlyEnabled() ? "/dev-login" : "/sign-in");
  const db = getDb();
  // 숨김 컬럼은 선택하지 않는다(화면·DTO에 싣지 않음).
  const [rel] = await db
    .select({ id: relationships.id, stage: relationships.stage })
    .from(relationships)
    .where(and(eq(relationships.userId, user.id), eq(relationships.characterId, characterId)))
    .limit(1);
  if (!rel) redirect("/onboarding");

  const now = clockNow();
  await maybeDay3Return(db, user, now);
  if (await takePaywall(db, user.id, now)) redirect("/paywall");
  const meta = await loadChatMeta(db, rel, now);
  const aroundParam = (await searchParams).around;
  const around = typeof aroundParam === "string" && isUuid(aroundParam) ? aroundParam : null;
  const aroundPage = around ? await loadMessages(db, rel.id, { mode: "around", id: around }, now) : null; // 남의 id·미도착 id는 null
  const page = aroundPage ?? (await loadMessages(db, rel.id, { mode: "latest" }, now));
  // 평가 UI는 베타 테스터에게만. 비베타는 평가 데이터도 읽지 않는다.
  const mine: Record<string, 1 | -1> = {};
  if (user.isBeta) {
    for (const r of await db.select({ msgId: ratings.msgId, score: ratings.score }).from(ratings).where(eq(ratings.userId, user.id))) {
      mine[r.msgId] = r.score === 1 ? 1 : -1;
    }
  }
  const tz = safeTz(user.tz);
  const status = await reconcileStatus(db, rel.id, now);
  const [ch] = await db.select({ name: characters.name }).from(characters).where(eq(characters.id, characterId)).limit(1);
  const name = characterName(ch?.name);

  const iconProps = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  const iconBtn = "flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]";

  return (
    <main className="chat-shell">
      <ChatViewport />
      <DevBanner />
      <ChatClient
        name={name}
        openProfileLabel={fmt(str["header.openProfile"], { name })}
        initialActivity={meta.activity}
        headerActions={
          <span className="flex flex-none">
            <Link href="/chat/search" aria-label={str["header.search"]} className={iconBtn}>
              <svg {...iconProps}>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </Link>
            <Link href="/me" aria-label={str["header.memories"]} className={iconBtn}>
              <svg {...iconProps}>
                <path d="M12 21s-7-4.4-9.3-8.6C1 9.2 2.6 5.5 6.2 5.5c2.1 0 3.5 1.2 5.8 3.5 2.3-2.3 3.7-3.5 5.8-3.5 3.6 0 5.2 3.7 3.5 6.9C19 16.6 12 21 12 21z" />
              </svg>
            </Link>
            <Link href="/settings" aria-label={str["header.settings"]} className={iconBtn}>
              <svg {...iconProps}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </Link>
          </span>
        }
        initialMessages={page?.messages ?? []}
        highlightId={aroundPage ? around : null}
        initialMeta={{ ...meta, hasMoreBefore: page?.hasMoreBefore ?? false }}
        tz={tz}
        {...chatFormat(product)}
        strings={chatListStrings(name, product)}
        isBeta={user.isBeta}
        ratings={mine}
        canSend={status === "active"}
        composer={{ placeholder: str["composer.placeholder"], label: str["composer.label"], sendLabel: str["composer.send"], reply: replyStripStrings(name, product) }}
        install={{ installHintTitle: str["install.hint"], installHintBody: str["install.steps"], installHintDismiss: str["install.dismiss"] }}
      >
        <div className="max-h-[50%] flex-none overflow-y-auto">
          <AppVoice screen="reconcile">
            <ReconcileForm
              open={status === "open"}
              strings={{ notYet: str["reconcile.notYet"], prompt: str["reconcile.prompt"], label: str["reconcile.label"], send: str["reconcile.send"] }}
            />
          </AppVoice>
        </div>
      </ChatClient>
    </main>
  );
}
