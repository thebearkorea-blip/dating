"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SearchHit } from "@/engine/chat-search";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "error" } | { kind: "done"; hits: SearchHit[] };

export function SearchClient({
  tz,
  locale,
  dayOptions,
  timeOptions,
  strings,
}: {
  tz: string;
  locale: string;
  dayOptions: Intl.DateTimeFormatOptions;
  timeOptions: Intl.DateTimeFormatOptions;
  strings: { placeholder: string; label: string; noResults: string; searching: string; error: string };
}) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const term = q.trim();
  const ready = Array.from(term).length >= 2;

  useEffect(() => {
    if (!ready) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setState({ kind: "loading" });
      try {
        const res = await fetch(`/api/chat/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { hits: SearchHit[] };
        setState({ kind: "done", hits: body.hits });
      } catch (e) {
        if (!ctl.signal.aborted) setState({ kind: "error" });
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [term, ready]);

  const when = (iso: string) => {
    const d = new Date(iso);
    return `${new Intl.DateTimeFormat(locale, { ...dayOptions, timeZone: tz }).format(d)} ${new Intl.DateTimeFormat(locale, { ...timeOptions, timeZone: tz }).format(d)}`;
  };
  const shown = ready ? state : ({ kind: "idle" } as State);

  return (
    <>
      <input
        type="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={strings.placeholder}
        aria-label={strings.label}
        className="w-full rounded-[var(--radius-control)] bg-[var(--color-surface)] px-4 py-3"
      />
      <div aria-live="polite" role="status">
        {shown.kind === "loading" ? <p className="text-sm text-[var(--color-ink-soft)]">{strings.searching}…</p> : null}
        {shown.kind === "error" ? <p className="text-sm text-red-600">{strings.error}</p> : null}
        {shown.kind === "done" && shown.hits.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">{strings.noResults}</p> : null}
      </div>
      {shown.kind === "done" ? (
        <ul className="flex flex-col gap-2">
          {shown.hits.map((h) => (
            <li key={h.id}>
              <Link href={`/chat?around=${h.id}`} className="block rounded-[var(--radius-control)] bg-[var(--color-surface)] px-4 py-3">
                <span className="block break-words">{h.snippet}</span>
                <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">{when(h.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
