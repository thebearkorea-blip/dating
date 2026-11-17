import { getStrings } from "@/product";

const rows: { mine: boolean; w: string }[] = [
  { mine: false, w: "w-2/3" },
  { mine: false, w: "w-1/2" },
  { mine: true, w: "w-3/5" },
  { mine: false, w: "w-3/4" },
  { mine: true, w: "w-2/5" },
];

export default function ChatLoading() {
  return (
    <main className="chat-shell" aria-busy="true">
      <span className="sr-only" role="status">
        {getStrings()["err.loading"]}
      </span>
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-4 py-3">
        {rows.map((r, i) => (
          <li key={i} className={`flex ${r.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`h-10 animate-pulse ${r.w} ${r.mine ? "bg-[var(--color-bubble-mine)] opacity-40" : "bg-[var(--color-bubble-his)]"}`}
              style={{ borderRadius: r.mine ? "var(--radius-bubble-mine)" : "var(--radius-bubble)" }}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
