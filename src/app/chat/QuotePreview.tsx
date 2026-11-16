"use client";

/** 말풍선 안의 인용 미리보기: 보낸 사람 + 한 줄 본문(사진이면 "Photo" + 썸네일). 탭하면 원 메시지로. */
export interface QuotePreviewProps {
  replyTo: { id: string; sender: "user" | "char" | "member"; text: string; mediaId: string | null };
  onJump: (id: string) => void;
  /** 보낸 사람 표시: 나 / 그. */
  youLabel: string;
  himLabel: string;
  photoLabel: string;
  jumpLabel: string;
  /** 내 말풍선 안이면 true(색 대비용). */
  mine: boolean;
}
export function QuotePreview({ replyTo, onJump, youLabel, himLabel, photoLabel, jumpLabel, mine }: QuotePreviewProps): React.ReactElement | null {
  const who = replyTo.sender === "user" ? youLabel : himLabel;
  const line = replyTo.text.trim() || (replyTo.mediaId ? photoLabel : "");
  return (
    <button
      type="button"
      aria-label={`${jumpLabel}: ${who} — ${line}`}
      onClick={(e) => {
        e.stopPropagation();
        onJump(replyTo.id);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={`mb-1.5 flex w-full min-w-0 items-center gap-2 rounded-lg border-l-[3px] px-2 py-1 text-left text-xs ${
        mine ? "border-white/70 bg-white/15" : "border-[var(--color-accent)] bg-[var(--color-surface)]/60"
      }`}
    >
      {replyTo.mediaId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/media/${replyTo.mediaId}`} alt="" loading="lazy" className="h-8 w-8 flex-none rounded object-cover" />
      ) : null}
      <span className="min-w-0">
        <span className="block font-semibold">{who}</span>
        <span className="block truncate opacity-90">{line}</span>
      </span>
    </button>
  );
}
