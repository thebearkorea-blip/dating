"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 다음 deliver_at 시각이 되면 목록을 다시 불러온다. 화면에는 아무것도 그리지 않는다("입력 중" 표시 없음). */
export function DeliveryTimer({ at }: { at: string }) {
  const router = useRouter();
  useEffect(() => {
    const ms = Math.max(new Date(at).getTime() - Date.now(), 0) + 300;
    const t = setTimeout(() => router.refresh(), Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [at, router]);
  return null;
}
