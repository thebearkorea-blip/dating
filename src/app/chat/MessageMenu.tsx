"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { USER_REACTIONS } from "@/engine/reaction-emoji";

export interface MessageMenuLabels {
  menu: string;
  reactions: string;
  /** "{emoji}" 자리표시자 포함. */
  add: string;
  remove: string;
  reply: string;
  copy: string;
}

/**
 * 말풍선 작은 메뉴: 반응 6종(그의 메시지만) + Reply + Copy. 화면 고정 위치(스크롤러에 잘리지 않게).
 * 키보드: 화살표·Home·End로 이동, Esc로 닫기. 열리면 첫 항목에 포커스, 닫히면 호출부가 포커스를 돌려준다.
 */
export function MessageMenu({
  anchor,
  alignEnd,
  canReact,
  canReply,
  canCopy,
  current,
  labels,
  onReact,
  onReply,
  onCopy,
  onClose,
}: {
  /** 말풍선의 화면 좌표(getBoundingClientRect). */
  anchor: { top: number; bottom: number; left: number; right: number };
  /** 내 말풍선이면 오른쪽 정렬. */
  alignEnd: boolean;
  canReact: boolean;
  canReply: boolean;
  canCopy: boolean;
  current?: string;
  labels: MessageMenuLabels;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  /** restoreFocus: 키보드로 닫았으면 true(호출부가 트리거로 포커스를 돌려준다), 바깥 탭이면 false. */
  onClose: (restoreFocus: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: "hidden" });

  // 위 공간이 충분하면 말풍선 위, 아니면 아래. 좌우는 화면 안으로.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const vw = window.innerWidth;
    const top = anchor.top - h - 8 > 8 ? anchor.top - h - 8 : Math.min(anchor.bottom + 8, window.innerHeight - h - 8);
    const left = alignEnd ? Math.max(8, Math.min(anchor.right - w, vw - w - 8)) : Math.max(8, Math.min(anchor.left, vw - w - 8));
    setPos({ top, left });
  }, [anchor, alignEnd]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeRef.current(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => items[(n + items.length) % items.length]?.focus();
    if (e.key === "Escape") closeRef.current(true);
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") closeRef.current(true);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const fill = (tpl: string, emoji: string) => tpl.replace("{emoji}", emoji);
  const item = "flex min-h-11 min-w-11 items-center justify-center rounded-full";

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={labels.menu}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-30 flex flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-1.5 text-[var(--color-ink)] shadow-lg"
      style={pos}
    >
      {canReact ? (
        <div role="group" aria-label={labels.reactions} className="flex gap-0.5">
          {USER_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              role="menuitem"
              aria-label={current === e ? fill(labels.remove, e) : fill(labels.add, e)}
              onClick={() => onReact(e)}
              className={`${item} text-xl ${current === e ? "bg-[var(--color-bubble-his)]" : "hover:bg-[var(--color-bg)]"}`}
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}
      {canReply || canCopy ? (
        <div className={`flex gap-1 ${canReact ? "border-t border-[var(--color-line)] pt-1" : ""}`}>
          {canReply ? (
            <button type="button" role="menuitem" onClick={onReply} className={`${item} flex-1 px-3 text-sm hover:bg-[var(--color-bg)]`}>
              {labels.reply}
            </button>
          ) : null}
          {canCopy ? (
            <button type="button" role="menuitem" onClick={onCopy} className={`${item} flex-1 px-3 text-sm hover:bg-[var(--color-bg)]`}>
              {labels.copy}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
