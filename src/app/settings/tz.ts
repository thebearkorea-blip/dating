import { CITIES } from "../onboarding/cities";

/** 유효한 IANA 시간대 이름이면 그대로, 아니면 null. */
export function validIanaTz(tz: unknown): string | null {
  if (typeof tz !== "string" || !tz || tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

/** 설정 저장 때 쓸 시간대. 브라우저 시간대(postedTz)는 도시가 "other"일 때만 받는다. 그 밖엔 도시 값. 바꿀 게 없으면 null. */
export function profileTz(cityId: string, postedTz: unknown, currentCity: string | null): string | null {
  const city = CITIES.find((c) => c.id === cityId);
  if (!city) return null;
  if (city.id === "other") return validIanaTz(postedTz) ?? (currentCity !== "other" ? city.tz : null);
  return city.id !== currentCity ? city.tz : null;
}
