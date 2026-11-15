import { describe, expect, it } from "vitest";
import { BUSY_OVERLAY_LINES_KO, langOf, pickBusyOverlay } from "../../src/engine/busy-overlay.js";

describe("busy-overlay 언어 선택", () => {
  it("langOf: 한글 포함이면 ko, 아니면 en", () => {
    expect(langOf("왜 영어로 이야기하지")).toBe("ko");
    expect(langOf("hi 안녕")).toBe("ko");
    expect(langOf("hello there")).toBe("en");
  });
  it("pickBusyOverlay(seed, ko)는 한국어 풀에서 고른다", () => {
    expect(BUSY_OVERLAY_LINES_KO as readonly string[]).toContain(pickBusyOverlay("seed-1", "ko"));
  });
});
