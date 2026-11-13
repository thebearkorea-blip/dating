import { devOnlyEnabled } from "./dev-only";

/** 현재 시각. 개발 환경에서만 FAKE_NOW(ISO) 또는 FAKE_NOW_OFFSET_DAYS(정수)로 조작한다. 프로덕션은 env를 무시한다. */
export function now(env: Record<string, string | undefined> = process.env): Date {
  if (devOnlyEnabled(env)) {
    if (env.FAKE_NOW) {
      const d = new Date(env.FAKE_NOW);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const off = Number.parseInt(env.FAKE_NOW_OFFSET_DAYS ?? "", 10);
    if (Number.isInteger(off)) return new Date(Date.now() + off * 86_400_000);
  }
  return new Date();
}
