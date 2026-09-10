import { describe, expect, it } from "vitest";
import { BUSINESS_DAYS, BUSINESS_HOURS, getHourSlots, getWeekDates, formatIsoDate } from "./schedule";

describe("schedule", () => {
  it("BUSINESS_DAYS is Monday through Friday", () => {
    expect(BUSINESS_DAYS).toEqual([1, 2, 3, 4, 5]);
  });

  it("getHourSlots returns 9 through 19 inclusive (no 20:00 slot)", () => {
    expect(getHourSlots()).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it("BUSINESS_HOURS ends at 19", () => {
    expect(BUSINESS_HOURS.end).toBe(19);
  });

  it("getWeekDates returns the Mon-Fri dates of the week containing a Wednesday anchor", () => {
    const wednesday = new Date("2026-09-09T00:00:00");
    const week = getWeekDates(wednesday);
    expect(week.map(formatIsoDate)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
    ]);
  });

  it("getWeekDates normalizes a weekend anchor to that week's Monday-Friday", () => {
    const saturday = new Date("2026-09-12T00:00:00");
    const week = getWeekDates(saturday);
    expect(week.map(formatIsoDate)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
    ]);
  });

  it("formatIsoDate pads month and day to two digits", () => {
    expect(formatIsoDate(new Date("2026-01-05T00:00:00"))).toBe("2026-01-05");
  });
});
