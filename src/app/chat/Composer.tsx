"use client";
import { useOptimistic, useState, useTransition } from "react";
import { sendMessage } from "./actions";

type Pending = { key: string; text: string };

/** 보낸 말풍선은 서버 응답 전에 바로 보인다(낙관적 표시). 액션이 끝나 실제 행이 오면 사라진다. "입력 중" 표시는 없다. */
export function Composer() {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [sending, addSending] = useOptimistic<Pending[], Pending>([], (list, p) => [...list, p]);
  return (
    <>
      {sending.length ? (
        <ul className="-mt-2 flex flex-col gap-2 px-4 pb-2">
          {sending.map((m) => (
            <li
              key={m.key}
              className="ml-auto max-w-[80%] rounded-[var(--radius-bubble-mine)] bg-[var(--color-bubble-mine)] px-4 py-2 text-[var(--color-bubble-mine-ink)]"
            >
              {m.text}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex-1" />
      <form
        className="flex gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t || pending) return;
          setText("");
          start(async () => {
            addSending({ key: `pending-${Date.now()}`, text: t });
            await sendMessage(t);
          });
        }}
      >
        <input
          name="text"
          aria-label="message"
          className="field"
          suppressHydrationWarning
          autoComplete="off"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn" disabled={pending} suppressHydrationWarning>
          Send
        </button>
      </form>
    </>
  );
}
