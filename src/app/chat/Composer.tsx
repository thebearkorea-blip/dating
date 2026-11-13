"use client";
import { useState, useTransition } from "react";
import { sendMessage } from "./actions";

export function Composer() {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex gap-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t || pending) return;
        setText("");
        start(async () => {
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
  );
}
