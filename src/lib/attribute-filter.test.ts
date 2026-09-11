import { describe, expect, it } from "vitest";
import {
  attributeFilterFromLineSelection,
  OVERALL_ATTRIBUTE_VALUE,
  sanitizeLineValues,
} from "@/lib/attribute-filter";

const DEPARTMENTS = ["開発部", "営業部", "総務部", "その他"];

describe("attributeFilterFromLineSelection", () => {
  it("returns no filter when no boxes are checked", () => {
    expect(attributeFilterFromLineSelection("age", [], DEPARTMENTS)).toEqual({
      ageBracket: [],
      gender: [],
      department: [],
    });
  });

  it("returns no filter when only the '全体' sentinel is checked", () => {
    expect(attributeFilterFromLineSelection("age", [OVERALL_ATTRIBUTE_VALUE], DEPARTMENTS)).toEqual({
      ageBracket: [],
      gender: [],
      department: [],
    });
  });

  it("filters the active dimension to a single checked value", () => {
    expect(attributeFilterFromLineSelection("gender", ["male"], DEPARTMENTS)).toEqual({
      ageBracket: [],
      gender: ["male"],
      department: [],
    });
  });

  it("OR-combines multiple checked values in the same dimension", () => {
    expect(attributeFilterFromLineSelection("age", ["20s", "30s"], DEPARTMENTS).ageBracket).toEqual(["20s", "30s"]);
  });

  it("clears the page-wide filter when '全体' is checked alongside real values", () => {
    expect(attributeFilterFromLineSelection("age", [OVERALL_ATTRIBUTE_VALUE, "20s"], DEPARTMENTS)).toEqual({
      ageBracket: [],
      gender: [],
      department: [],
    });
  });

  it("clears the filter with '全体' checked no matter how many other values are checked", () => {
    expect(
      attributeFilterFromLineSelection("age", [OVERALL_ATTRIBUTE_VALUE, "20s", "30s", "40s"], DEPARTMENTS)
    ).toEqual({ ageBracket: [], gender: [], department: [] });
  });

  it("drops an unrecognized age bracket instead of passing it to a query (the PR review's ?age=bogus case)", () => {
    expect(attributeFilterFromLineSelection("age", ["bogus"], DEPARTMENTS).ageBracket).toEqual([]);
  });

  it("drops an unrecognized gender", () => {
    expect(attributeFilterFromLineSelection("gender", ["xx"], DEPARTMENTS).gender).toEqual([]);
  });

  it("rejects 'unspecified' as a gender filter — it's a real value in the DB enum but not an allowed filter", () => {
    expect(attributeFilterFromLineSelection("gender", ["unspecified"], DEPARTMENTS).gender).toEqual([]);
  });

  it("validates department against the live department list", () => {
    expect(attributeFilterFromLineSelection("department", ["開発部", "nope"], DEPARTMENTS).department).toEqual([
      "開発部",
    ]);
  });

  it("only filters the active dimension, even if values happen to be checked", () => {
    const result = attributeFilterFromLineSelection("department", ["開発部"], DEPARTMENTS);
    expect(result.ageBracket).toEqual([]);
    expect(result.gender).toEqual([]);
  });

  it("sanitizes unknown and duplicate chart selections before rendering", () => {
    expect(sanitizeLineValues("age", ["20s", "bogus", "20s", OVERALL_ATTRIBUTE_VALUE], DEPARTMENTS)).toEqual([
      "20s",
      OVERALL_ATTRIBUTE_VALUE,
    ]);
  });

  it("validates chart department selections against the live department list", () => {
    expect(sanitizeLineValues("department", ["開発部", "存在しない部署"], DEPARTMENTS)).toEqual(["開発部"]);
  });
});
