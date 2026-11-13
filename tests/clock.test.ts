import { describe, expect, it } from "vitest";
import { now } from "../src/clock.js";

describe("clock.now", () => {
  it("개발 환경에서는 FAKE_NOW·FAKE_NOW_OFFSET_DAYS를 따른다", () => {
    expect(now({ NODE_ENV: "development", FAKE_NOW: "2026-01-02T03:04:05Z" }).toISOString()).toBe("2026-01-02T03:04:05.000Z");
    const d = now({ NODE_ENV: "development", FAKE_NOW_OFFSET_DAYS: "3" });
    expect(Math.abs(d.getTime() - (Date.now() + 3 * 86_400_000))).toBeLessThan(5000);
  });
  it("production에서는 env를 무시한다", () => {
    const d = now({ NODE_ENV: "production", FAKE_NOW: "2020-01-01T00:00:00Z", FAKE_NOW_OFFSET_DAYS: "31" });
    expect(Math.abs(d.getTime() - Date.now())).toBeLessThan(5000);
  });
});
