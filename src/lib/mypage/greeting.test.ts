import { describe, expect, it } from "vitest";
import { getGreeting } from "./greeting";

describe("getGreeting", () => {
  it("returns the evening message from 18:00 onward, any day", () => {
    const g = getGreeting(new Date("2026-09-09T18:30:00")); // Wednesday
    expect(g.title).toBe("今日も一日お疲れさまでした");
  });

  it("returns the evening message even on a Monday morning-eligible hour combo (evening wins)", () => {
    const g = getGreeting(new Date("2026-09-07T19:00:00")); // Monday evening
    expect(g.title).toBe("今日も一日お疲れさまでした");
  });

  it("returns the Friday afternoon message on Friday from 14:00, before evening", () => {
    const g = getGreeting(new Date("2026-09-11T15:00:00")); // Friday afternoon
    expect(g.title).toBe("今週もお疲れさまでした");
  });

  it("does not return the Friday message on Friday morning", () => {
    const g = getGreeting(new Date("2026-09-11T09:00:00")); // Friday morning
    expect(g.title).not.toBe("今週もお疲れさまでした");
  });

  it("returns the Monday morning message before noon", () => {
    const g = getGreeting(new Date("2026-09-07T09:00:00")); // Monday morning
    expect(g.title).toBe("今週も一週間よろしくお願いします");
  });

  it("returns the lunchtime message between 11:00 and 14:00 on a non-special day", () => {
    const g = getGreeting(new Date("2026-09-09T12:00:00")); // Wednesday lunch
    expect(g.title).toBe("お昼休みにひと息");
  });

  it("returns the default message otherwise", () => {
    const g = getGreeting(new Date("2026-09-09T10:00:00")); // Wednesday mid-morning
    expect(g.title).toBe("ちょっと休憩しませんか？");
  });
});
