"use client";
import Link from "next/link";
import { useCallback, useRef, useState, type ReactNode } from "react";
import type { MessageDto } from "@/engine/chat-view";
import { Composer, deliver, type ReplyStripStrings } from "./Composer";
import { InstallHint } from "./InstallHint";
import { MessageList, type ChatListStrings, type ChatMeta, type MessageListHandle, type ReplyTarget } from "./MessageList";

/** 채팅 화면의 클라이언트 쪽 뼈대: 헤더(활동 문구는 onMeta로 갱신) + 목록 + 입력창. MessageList ref를 여기서 쥔다. */
export function ChatClient({
  name,
  avatarUrl,
  openProfileLabel,
  initialActivity,
  headerActions,
  initialMessages,
  initialMeta,
  highlightId,
  tz,
  locale,
  timeOptions,
  dayOptions,
  strings,
  isBeta,
  ratings,
  canSend,
  composer,
  install,
  children,
}: {
  name: string;
  avatarUrl?: string | null;
  openProfileLabel: string;
  initialActivity: string;
  headerActions: ReactNode;
  initialMessages: MessageDto[];
  initialMeta: ChatMeta;
  /** 검색 결과로 들어왔을 때 스크롤·강조할 메시지 id. */
  highlightId?: string | null;
  tz: string;
  locale: string;
  timeOptions: Intl.DateTimeFormatOptions;
  dayOptions: Intl.DateTimeFormatOptions;
  strings: ChatListStrings;
  isBeta: boolean;
  ratings: Record<string, 1 | -1>;
  /** false면 입력창 대신 children(이별 뒤 화해 화면)을 그린다. */
  canSend: boolean;
  composer: { placeholder: string; label: string; sendLabel: string; reply?: ReplyStripStrings; slowDown?: string };
  install: { installHintTitle: string; installHintBody: string; installHintDismiss: string };
  children?: ReactNode;
}) {
  const listRef = useRef<MessageListHandle>(null);
  const [activity, setActivity] = useState(initialActivity);
  const onMeta = useCallback((m: ChatMeta) => setActivity(m.activity), []);
  const onRetry = useCallback((id: string, text: string, replyTo: string | null) => {
    listRef.current?.markPending(id);
    void deliver(listRef.current, id, text, replyTo);
  }, []);
  const [reply, setReply] = useState<ReplyTarget | null>(null);
  const onReply = useCallback((t: ReplyTarget) => setReply(t), []);
  const cancelReply = useCallback(() => setReply(null), []);

  return (
    <>
      <header className="chat-header">
        <div className="flex min-h-14 items-center justify-between gap-2 py-1">
          <Link href="/him" aria-label={openProfileLabel} className="flex min-w-0 items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" aria-hidden="true" className="h-10 w-10 flex-none rounded-full object-cover object-top" />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[var(--color-bubble-his)] text-base font-semibold text-[var(--color-bubble-his-ink)]"
              >
                {Array.from(name)[0]?.toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold leading-tight">{name}</span>
              <span className="block truncate text-xs leading-tight text-[var(--color-ink-soft)]">{activity}</span>
            </span>
          </Link>
          {headerActions}
        </div>
      </header>
      <InstallHint strings={install} />
      <MessageList
        ref={listRef}
        initialMessages={initialMessages}
        initialMeta={initialMeta}
        highlightId={highlightId}
        tz={tz}
        locale={locale}
        timeOptions={timeOptions}
        dayOptions={dayOptions}
        strings={strings}
        isBeta={isBeta}
        ratings={ratings}
        onRetry={onRetry}
        onReply={canSend ? onReply : undefined}
        onMeta={onMeta}
      />
      {canSend ? <Composer
          listRef={listRef}
          placeholder={composer.placeholder}
          label={composer.label}
          sendLabel={composer.sendLabel}
          reply={reply}
          onCancelReply={cancelReply}
          replyStrings={composer.reply}
          slowDown={composer.slowDown}
        /> : children}
    </>
  );
}
