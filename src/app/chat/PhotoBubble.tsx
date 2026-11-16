"use client";
import { useState } from "react";

/** 사진 말풍선: 테두리 없는 둥근 사진. 로딩 중에도 4:5 자리를 잡아 레이아웃이 밀리지 않는다. */
export interface PhotoBubbleProps {
  mediaId: string;
  alt: string;
  onOpen: () => void;
  onReply: () => void;
  /** 기본 "Reply". */
  replyLabel?: string;
}
export function PhotoBubble({ mediaId, alt, onOpen, onReply, replyLabel = "Reply" }: PhotoBubbleProps): React.ReactElement {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="mb-2 flex w-[min(60vw,15rem)] flex-col items-start gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-[var(--radius-control)] bg-[var(--color-surface)]"
        style={{ aspectRatio: "4 / 5" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/${mediaId}`}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition-opacity motion-reduce:transition-none ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      </button>
      <button type="button" onClick={onReply} className="min-h-6 px-1 text-xs underline opacity-80">
        {replyLabel}
      </button>
    </div>
  );
}

/** W4가 PhotoBubble을 실제로 구현하면 true로 바꾼다. false인 동안 MessageList는 기본 <img>를 쓴다. */
export const PHOTO_BUBBLE_IMPLEMENTED = true;
