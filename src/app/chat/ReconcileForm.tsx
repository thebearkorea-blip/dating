"use client";
import { useState, useTransition } from "react";
import { sendApology } from "./actions";

/** 이별 뒤 화면(앱 목소리). 시기가 아니면 날짜 없이 "아직"만 보인다. */
export function ReconcileForm({ open }: { open: boolean }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <p className="p-4 text-sm">
        Not yet. This conversation has ended for now.
      </p>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t || pending) return;
        setText("");
        start(async () => {
          await sendApology(t);
        });
      }}
    >
      <p className="text-sm">Want to reach out again? Write what you want to say to him.</p>
      <textarea
        name="apology"
        aria-label="apology"
        className="field"
        rows={4}
        maxLength={1000}
        suppressHydrationWarning
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="btn" disabled={pending} suppressHydrationWarning>
        Send
      </button>
    </form>
  );
}
