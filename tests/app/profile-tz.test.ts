import { describe, expect, it } from "vitest";
import { profileTz, validIanaTz } from "../../src/app/settings/tz.js";

describe("profileTz", () => {
  it("validIanaTz: 유효한 IANA만 통과", () => {
    expect(validIanaTz("Europe/Paris")).toBe("Europe/Paris");
    expect(validIanaTz("Not/AZone")).toBeNull();
    expect(validIanaTz("")).toBeNull();
    expect(validIanaTz(undefined)).toBeNull();
  });
  it("other + 유효한 브라우저 시간대 → 그 값", () => {
    expect(profileTz("other", "Europe/Paris", "seoul")).toBe("Europe/Paris");
    expect(profileTz("other", "Europe/Paris", "other")).toBe("Europe/Paris");
  });
  it("other + 잘못된 값 → 도시 바꿀 때만 UTC, 이미 other면 변경 없음", () => {
    expect(profileTz("other", "bogus", "seoul")).toBe("UTC");
    expect(profileTz("other", "bogus", "other")).toBeNull();
  });
  it("other가 아니면 posted tz를 무시하고 도시 값", () => {
    expect(profileTz("tokyo", "Europe/Paris", "seoul")).toBe("Asia/Tokyo");
    expect(profileTz("tokyo", "Europe/Paris", "tokyo")).toBeNull();
  });
  it("모르는 도시 → null", () => {
    expect(profileTz("mars", "Europe/Paris", "seoul")).toBeNull();
  });
});
