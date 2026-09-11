import { describe, expect, it } from "vitest";
import { isValidISODate, todayISO } from "@/lib/period";

describe("isValidISODate", () => {
  it("accepts a well-formed date", () => {
    expect(isValidISODate("2026-09-10")).toBe(true);
  });

  it("rejects a non-date string (the PR review's ?ref=bad case)", () => {
    expect(isValidISODate("bad")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidISODate("")).toBe(false);
  });

  it("rejects a wrong-format date", () => {
    expect(isValidISODate("2026/09/10")).toBe(false);
  });

  it("rejects a partial date", () => {
    expect(isValidISODate("2026-09")).toBe(false);
  });

  it("rejects a calendar date that JavaScript would otherwise roll into the next month", () => {
    expect(isValidISODate("2026-02-31")).toBe(false);
  });

  it("handles leap days strictly", () => {
    expect(isValidISODate("2024-02-29")).toBe(true);
    expect(isValidISODate("2025-02-29")).toBe(false);
  });
});

describe("todayISO", () => {
  it("uses the Japanese calendar date on both sides of the UTC day boundary", () => {
    expect(todayISO(new Date("2026-09-09T14:59:59Z"))).toBe("2026-09-09");
    expect(todayISO(new Date("2026-09-09T15:00:00Z"))).toBe("2026-09-10");
  });
});
