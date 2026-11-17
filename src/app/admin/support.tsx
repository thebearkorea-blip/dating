import { supportInbox } from "@/admin/queries";
import { getDb } from "@/db/client";

export async function SupportTab() {
  const items = await supportInbox(getDb());
  return (
    <section className="flex flex-col gap-2 text-sm">
      <h2 className="font-semibold">문의·신고 {items.length}건 (최신순)</h2>
      {items.length === 0 ? <p className="text-[var(--color-ink-soft)]">없음</p> : null}
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.id} className="rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-2">
            <p className="text-[var(--color-ink-soft)]">
              {i.kind === "support_request" ? `문의 · ${i.category ?? "-"}` : `답장 신고 · ${i.reason ?? "-"}`} · {i.at.toISOString().slice(0, 16).replace("T", " ")} · {i.userId ?? "-"}
            </p>
            {i.kind === "support_request" ? <p className="whitespace-pre-wrap">{i.text}</p> : <p className="whitespace-pre-wrap">&ldquo;{i.msgText ?? "(삭제됨)"}&rdquo;</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
