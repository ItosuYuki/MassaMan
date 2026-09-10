import { describe, expect, it } from "vitest";
import {
  BUSINESS_DAYS,
  BUSINESS_HOURS,
  SLOT_STEP_MINUTES,
  CLOSING_TIME_MINUTES,
  getTimeSlots,
  formatTimeLabel,
  getWeekDates,
  formatIsoDate,
  isSlotInPast,
} from "./schedule";

describe("schedule", () => {
  it("BUSINESS_DAYS is Monday through Friday", () => {
    expect(BUSINESS_DAYS).toEqual([1, 2, 3, 4, 5]);
  });

  it("BUSINESS_HOURS ends at 19", () => {
    expect(BUSINESS_HOURS.end).toBe(19);
  });

  it("getTimeSlots returns every 15 minutes from 9:00 through 19:30 inclusive", () => {
    const slots = getTimeSlots();
    expect(slots[0]).toBe(9 * 60);
    expect(slots[slots.length - 1]).toBe(19 * 60 + 30);
    expect(slots.length).toBe((19 - 9) * 4 + 3);
    expect(SLOT_STEP_MINUTES).toBe(15);
  });

  it("CLOSING_TIME_MINUTES is 19:45", () => {
    expect(CLOSING_TIME_MINUTES).toBe(19 * 60 + 45);
  });

  it("formatTimeLabel formats minutes-from-midnight as H:MM", () => {
    expect(formatTimeLabel(9 * 60)).toBe("9:00");
    expect(formatTimeLabel(9 * 60 + 15)).toBe("9:15");
    expect(formatTimeLabel(9 * 60 + 45)).toBe("9:45");
    expect(formatTimeLabel(19 * 60)).toBe("19:00");
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

  describe("isSlotInPast", () => {
    const now = new Date("2026-09-09T14:30:00");

    it("is false for a slot later today", () => {
      expect(isSlotInPast("2026-09-09", 15 * 60, now)).toBe(false);
    });

    it("is true for a slot earlier today, even mid-hour", () => {
      expect(isSlotInPast("2026-09-09", 14 * 60, now)).toBe(true);
    });

    it("is true for a slot 15 minutes ago", () => {
      expect(isSlotInPast("2026-09-09", 14 * 60 + 15, now)).toBe(true);
    });

    it("is false for a slot 15 minutes from now", () => {
      expect(isSlotInPast("2026-09-09", 14 * 60 + 45, now)).toBe(false);
    });

    it("is true for the exact current minute (the slot has already started)", () => {
      const onTheDot = new Date("2026-09-09T14:00:00");
      expect(isSlotInPast("2026-09-09", 14 * 60, onTheDot)).toBe(true);
    });

    it("is true for any slot on a past date", () => {
      expect(isSlotInPast("2026-09-08", 18 * 60, now)).toBe(true);
    });

    it("is false for any slot on a future date", () => {
      expect(isSlotInPast("2026-09-10", 9 * 60, now)).toBe(false);
    });
  });
});
