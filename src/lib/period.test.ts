import { describe, expect, it } from "vitest";
import { isValidISODate } from "@/lib/period";

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
});
