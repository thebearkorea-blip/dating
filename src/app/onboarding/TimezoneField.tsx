"use client";
import { useEffect, useRef } from "react";

/** 브라우저 시간대를 폼에 실어 보낸다. 값이 없으면 서버가 도시 기본값을 쓴다. */
export function TimezoneField() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, []);
  return <input ref={ref} type="hidden" name="tz" defaultValue="" />;
}
