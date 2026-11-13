import { describe, expect, it } from "vitest";
import { ageGate } from "../../src/policy/age-gate";

const now = new Date("2026-11-13T00:00:00Z");

describe("ageGate", () => {
  it("18+ → romance", () => {
    expect(ageGate(2000, now)).toEqual({ kind: "romance", ageBand: "18+" });
  });
  it("13~17 → preparing", () => {
    expect(ageGate(2010, now)).toEqual({ kind: "preparing", ageBand: "14-17" });
    expect(ageGate(2008, now).kind).toBe("preparing");
  });
  it("13 미만 → rejected", () => {
    expect(ageGate(2020, now)).toEqual({ kind: "rejected" });
  });
});
