"use client";
import { useState } from "react";

/** 브라우저 confirm 없이 2단계 버튼: 한 번 누르면 "정말 삭제"로 바뀌고, 다시 누르면 제출한다. */
export function ConfirmDelete({ action, label, confirmLabel }: { action: () => Promise<void>; label: string; confirmLabel: string }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className="btn" onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <form action={action} className="flex gap-3">
      <button type="submit" className="btn">
        {confirmLabel}
      </button>
      <button type="button" className="text-sm underline" onClick={() => setArmed(false)}>
        Keep
      </button>
    </form>
  );
}
