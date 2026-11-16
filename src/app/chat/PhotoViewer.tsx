"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CLOSE_DISTANCE = 100;

/** 전체 화면 사진 뷰어. 닫기 버튼·Esc·아래로 쓸기. 길게 눌러 저장은 브라우저 기본. */
export function PhotoViewer({ mediaId, alt, closeLabel = "Close", onClose }: { mediaId: string; alt: string; closeLabel?: string; onClose: () => void }) {
  const [dy, setDy] = useState(0);
  const [mounted, setMounted] = useState(false);
  const startY = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduced = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      // 포커스 가능한 요소가 닫기 버튼 하나뿐이라 Tab은 그대로 붙잡아 둔다.
      else if (e.key === "Tab") {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus();
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      style={{ opacity: Math.max(0.3, 1 - dy / 400) }}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-2xl text-white"
        style={{ marginTop: "env(safe-area-inset-top)" }}
      >
        <span aria-hidden="true">×</span>
      </button>
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          startY.current = e.clientY;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (startY.current !== null) setDy(Math.max(0, e.clientY - startY.current));
        }}
        onPointerUp={() => {
          const far = dy > CLOSE_DISTANCE;
          startY.current = null;
          setDy(0);
          if (far) onClose();
        }}
        onPointerCancel={() => {
          startY.current = null;
          setDy(0);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/${mediaId}`}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full object-contain"
          style={{ transform: `translateY(${dy}px)`, transition: startY.current === null && !reduced.current ? "transform 150ms" : "none" }}
        />
      </div>
    </div>,
    document.body,
  );
}
