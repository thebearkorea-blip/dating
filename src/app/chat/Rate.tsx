"use client";
import { useState, useTransition } from "react";
import { rateMessage } from "./actions";

// 베타 테스터에게만 렌더된다(page.tsx가 is_beta일 때만 마운트).
export function Rate({ msgId, initial }: { msgId: string; initial: 1 | -1 | null }) {
  const [score, setScore] = useState<1 | -1 | null>(initial);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(initial !== null);
  const [pending, start] = useTransition();
  const save = (s: 1 | -1, n: string) =>
    start(async () => {
      const r = await rateMessage(msgId, s, n);
      setSaved(r.ok);
    });
  return (
    <div className="mt-1 flex flex-col gap-1 text-xs text-[var(--color-ink-soft)]">
      <span className="flex gap-2">
        {([1, -1] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-label={s === 1 ? "good" : "bad"}
            aria-pressed={score === s}
            disabled={pending}
            className={score === s ? "font-bold underline" : ""}
            onClick={() => {
              setScore(s);
              setOpen(true);
              save(s, note);
            }}
          >
            {s === 1 ? "👍" : "👎"}
          </button>
        ))}
        {saved ? <span>saved</span> : null}
      </span>
      {open && score ? (
        <span className="flex gap-1">
          <input
            aria-label="note"
            className="field"
            maxLength={500}
            value={note}
            placeholder="note"
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="button" className="btn" disabled={pending} onClick={() => save(score, note)}>
            Save
          </button>
        </span>
      ) : null}
    </div>
  );
}
