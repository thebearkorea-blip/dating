"use client";
import { useState } from "react";
import { PhotoViewer } from "../chat/PhotoViewer";

/** 그가 보낸 사진 격자. 탭하면 전체 화면 뷰어. */
export function PhotoGrid({ mediaIds, alt, closeLabel }: { mediaIds: string[]; alt: string; closeLabel: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <ul className="grid grid-cols-3 gap-1">
        {mediaIds.map((id, i) => (
          <li key={`${id}-${i}`}>
            <button type="button" onClick={() => setOpen(id)} className="block aspect-square w-full overflow-hidden rounded-[var(--radius-control)] bg-[var(--color-surface)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/media/${id}`} alt={alt} loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {open ? <PhotoViewer mediaId={open} alt={alt} closeLabel={closeLabel} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
