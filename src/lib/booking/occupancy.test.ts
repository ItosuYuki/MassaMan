import { describe, expect, it } from "vitest";
import { computeOccupancyRate } from "./occupancy";

describe("computeOccupancyRate", () => {
  it("returns 0 when the therapist has no reservations this week", () => {
    expect(computeOccupancyRate({ reservationCountInWeek: 0, businessDaysPerWeek: 5, hoursPerDay: 11 })).toBe(0);
  });

  it("returns the fraction of booked hours out of total available hours", () => {
    // 5 days * 11 hours = 55 slots/week; 11 booked => 0.2
    expect(
      computeOccupancyRate({ reservationCountInWeek: 11, businessDaysPerWeek: 5, hoursPerDay: 11 })
    ).toBeCloseTo(0.2);
  });

  it("returns 1 when fully booked", () => {
    expect(computeOccupancyRate({ reservationCountInWeek: 55, businessDaysPerWeek: 5, hoursPerDay: 11 })).toBe(1);
  });

  it("returns 0 when there are no bookable slots at all", () => {
    expect(computeOccupancyRate({ reservationCountInWeek: 0, businessDaysPerWeek: 0, hoursPerDay: 11 })).toBe(0);
  });
});
