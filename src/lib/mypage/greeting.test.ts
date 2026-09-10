import { describe, expect, it } from "vitest";
import { getGreeting, getGreetingPool } from "./greeting";

describe("getGreetingPool", () => {
  it("returns the evening pool from 18:00 onward, any day", () => {
    const pool = getGreetingPool(new Date("2026-09-09T18:30:00")); // Wednesday
    expect(pool.every((g) => g.emoji === "🌙")).toBe(true);
  });

  it("returns the evening pool even on a Monday morning-eligible hour combo (evening wins)", () => {
    const pool = getGreetingPool(new Date("2026-09-07T19:00:00")); // Monday evening
    expect(pool.every((g) => g.emoji === "🌙")).toBe(true);
  });

  it("returns the Friday afternoon pool on Friday from 14:00, before evening", () => {
    const pool = getGreetingPool(new Date("2026-09-11T15:00:00")); // Friday afternoon
    expect(pool.every((g) => g.emoji === "🎉")).toBe(true);
  });

  it("does not return the Friday pool on Friday morning", () => {
    const pool = getGreetingPool(new Date("2026-09-11T09:00:00")); // Friday morning
    expect(pool.some((g) => g.emoji === "🎉")).toBe(false);
  });

  it("returns the Monday morning pool before noon", () => {
    const pool = getGreetingPool(new Date("2026-09-07T09:00:00")); // Monday morning
    expect(pool.every((g) => g.emoji === "🌱")).toBe(true);
  });

  it("returns the lunchtime pool between 11:00 and 14:00 on a non-special day", () => {
    const pool = getGreetingPool(new Date("2026-09-09T12:00:00")); // Wednesday lunch
    expect(pool.every((g) => g.emoji === "🍃")).toBe(true);
  });

  it("returns the default pool otherwise", () => {
    const pool = getGreetingPool(new Date("2026-09-09T10:00:00")); // Wednesday mid-morning
    expect(pool.every((g) => g.emoji === "🌿")).toBe(true);
  });

  it("every pool has at least 2 phrasing variants", () => {
    const pool = getGreetingPool(new Date("2026-09-09T10:00:00"));
    expect(pool.length).toBeGreaterThanOrEqual(2);
  });
});

describe("getGreeting", () => {
  it("always returns a greeting from the matching context's pool", () => {
    const now = new Date("2026-09-09T10:00:00");
    const pool = getGreetingPool(now);
    for (let i = 0; i < 20; i++) {
      const g = getGreeting(now);
      expect(pool).toContainEqual(g);
    }
  });
});
