"use client";
import { useState, useTransition } from "react";
import { sendApology } from "./actions";

export type ReconcileStrings = { notYet: string; prompt: string; label: string; send: string };

/** 이별 뒤 화면(앱 목소리). 시기가 아니면 날짜 없이 "아직"만 보인다. 문구는 서버가 src/product 사전에서 넘긴다. */
export function ReconcileForm({ open, strings }: { open: boolean; strings: ReconcileStrings }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <p className="p-4 text-sm">
        {strings.notYet}
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
      <p className="text-sm">{strings.prompt}</p>
      <textarea
        name="apology"
        aria-label={strings.label}
        className="field"
        rows={4}
        maxLength={1000}
        suppressHydrationWarning
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="btn" disabled={pending} suppressHydrationWarning>
        {strings.send}
      </button>
    </form>
  );
}
