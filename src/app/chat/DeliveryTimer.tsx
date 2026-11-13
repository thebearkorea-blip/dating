"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 다음 deliver_at 시각이 지나면 목록을 다시 불러온다. 화면에는 아무것도 그리지 않는다("입력 중" 표시 없음).
 * 한 번만 예약하지 않고 1초마다 확인한다: 전송 Server Action이 진행 중일 때 들어간 refresh는 묻힐 수 있고,
 * 그러면 새로고침 전까지 답장이 안 보인다. 이 컴포넌트는 대기 중 답장이 있을 때만 마운트되므로 비용이 없다.
 */
export function DeliveryTimer({ at }: { at: string }) {
  const router = useRouter();
  useEffect(() => {
    const due = new Date(at).getTime() + 300;
    const t = setInterval(() => {
      if (Date.now() >= due) router.refresh();
    }, 1000);
    return () => clearInterval(t);
  }, [at, router]);
  return null;
}
