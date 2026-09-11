import { describe, expect, it } from "vitest";
import {
  firstSearchParam,
  parseCompare,
  parseLineAttr,
  parseLineValues,
  parsePeriod,
  parseReferenceDate,
} from "@/lib/dashboard-params";

describe("dashboard search parameter parsing", () => {
  it("uses the first value for repeated scalar parameters", () => {
    expect(firstSearchParam(["month", "year"])).toBe("month");
    expect(parsePeriod(["month", "year"])).toBe("month");
    expect(parseLineAttr(["gender", "age"])).toBe("gender");
    expect(parseCompare(["1", "0"])).toBe(true);
  });

  it("flattens comma-separated and repeated multi-select parameters", () => {
    expect(parseLineValues(["20s,30s", "40s", "20s", ""])).toEqual(["20s", "30s", "40s"]);
  });

  it("falls back for an impossible reference date", () => {
    expect(parseReferenceDate("2026-02-31", "2026-09-10")).toBe("2026-09-10");
  });

  it("accepts the first valid repeated reference date", () => {
    expect(parseReferenceDate(["2026-09-10", "2026-09-11"], "2026-01-01")).toBe("2026-09-10");
  });

  it("falls back to the caller's own default when compare is unset, per page", () => {
    expect(parseCompare(undefined)).toBe(false);
    expect(parseCompare(undefined, true)).toBe(true);
  });

  it("lets an explicit compare value override either page's default", () => {
    expect(parseCompare("0", true)).toBe(false);
    expect(parseCompare("1", false)).toBe(true);
  });
});
