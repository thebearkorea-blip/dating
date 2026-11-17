"use client";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { sendMessage } from "./actions";
import type { MessageListHandle, ReplyTarget } from "./MessageList";

/** visualViewport 크기·위치를 CSS 변수(--app-height·--app-top)로 반영한다. iOS 키보드가 올라와도 헤더·입력창이 화면 안에 남는다. */
export function ChatViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty("--app-height", `${vv.height}px`);
      root.style.setProperty("--app-top", `${vv.offsetTop}px`);
      root.dataset.kb = window.innerHeight - vv.height > 100 ? "open" : "closed";
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
      delete root.dataset.kb;
    };
  }, []);
  return null;
}

/** 서버에 보내고 결과를 목록에 반영한다. 성공이면 즉시 1회 조회, 실패면 "Not delivered"(글자 유지). 재시도도 같은 id(와 인용 대상)로 이 함수를 쓴다. */
export async function deliver(list: MessageListHandle | null, id: string, text: string, replyTo: string | null = null): Promise<"ok" | "limited" | "failed"> {
  let ok = false;
  let limited = false;
  try {
    const r = await sendMessage(text, id, replyTo);
    ok = r.ok;
    limited = !!r.limited;
  } catch {
    ok = false;
  }
  if (ok) list?.refetch();
  else list?.markFailed(id);
  return ok ? "ok" : limited ? "limited" : "failed";
}

/** 보내면 목록에 낙관적 말풍선이 바로 생긴다(MessageList). "입력 중" 표시는 서버 meta 몫. */
export interface ReplyStripStrings {
  /** "{name}"은 이미 채운 문구. */
  replyingTo: string;
  replyingToYourself: string;
  cancelReply: string;
  photo: string;
}

export function Composer({
  listRef,
  placeholder,
  label,
  sendLabel,
  reply = null,
  onCancelReply,
  replyStrings,
  slowDown = "Slow down a little. Try again in a moment.",
}: {
  listRef: RefObject<MessageListHandle | null>;
  placeholder: string;
  label: string;
  sendLabel: string;
  /** 인용 답장 대상(입력창 위 띠). */
  reply?: ReplyTarget | null;
  onCancelReply?: () => void;
  replyStrings?: ReplyStripStrings;
  /** 연타 제한에 걸렸을 때 안내(글자는 "Not delivered" 말풍선에 남아 탭하면 다시 보낸다). */
  slowDown?: string;
}) {
  const [text, setText] = useState("");
  const [limited, setLimited] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);

  // 인용 대상이 정해지면 입력창에 포커스.
  useEffect(() => {
    if (reply) area.current?.focus();
  }, [reply]);

  // 글자 수에 맞춰 높이를 늘린다(CSS max-height가 5줄에서 막는다).
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  return (
    <div className="chat-composer">
      {limited ? (
        <p role="status" className="border-b border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-ink-soft)]">
          {slowDown}
        </p>
      ) : null}
      {reply ? (
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-2 text-sm">
          {reply.mediaId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${reply.mediaId}`} alt="" className="h-9 w-9 flex-none rounded object-cover" />
          ) : null}
          <div className="min-w-0 flex-1 border-l-[3px] border-[var(--color-accent)] pl-2">
            <p className="text-xs font-semibold text-[var(--color-accent)]">
              {reply.sender === "user" ? (replyStrings?.replyingToYourself ?? "Replying to yourself") : (replyStrings?.replyingTo ?? "Replying")}
            </p>
            <p className="truncate text-[var(--color-ink-soft)]">{reply.text.trim() || (replyStrings?.photo ?? "Photo")}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label={replyStrings?.cancelReply ?? "Cancel reply"}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ) : null}
      <form
        ref={form}
        className="flex items-end gap-2 px-4 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          setText("");
          const id = crypto.randomUUID();
          listRef.current?.addOptimistic({ id, text: t, replyTo: reply });
          void deliver(listRef.current, id, t, reply?.id ?? null).then((r) => {
            if (r !== "limited") return;
            setLimited(true);
            setTimeout(() => setLimited(false), 6000);
          });
          onCancelReply?.();
        }}
      >
        <textarea
          ref={area}
          name="text"
          rows={1}
          aria-label={label}
          placeholder={placeholder}
          className="chat-input"
          suppressHydrationWarning
          autoComplete="off"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 터치 기기에서는 Enter가 줄바꿈. IME 조합 중 Enter(일본어·한국어 확정)는 전송하지 않는다.
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            if (window.matchMedia("(pointer: coarse)").matches) return;
            e.preventDefault();
            form.current?.requestSubmit();
          }}
        />
        <button type="submit" className="btn" disabled={!text.trim()} suppressHydrationWarning>
          {sendLabel}
        </button>
      </form>
    </div>
  );
}
