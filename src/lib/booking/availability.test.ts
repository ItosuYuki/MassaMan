import { describe, expect, it } from "vitest";
import { computeSlotStatus } from "./availability";

const base = { totalRooms: 2, bookedRoomCount: 0, isOwnReservation: false, isPast: false, wouldExceedClosing: false };

describe("computeSlotStatus", () => {
  it("returns reserved when the current user already booked this slot", () => {
    expect(computeSlotStatus({ ...base, bookedRoomCount: 1, isOwnReservation: true })).toBe("reserved");
  });

  it("returns reserved even if every room happens to be booked, when one is the user's own", () => {
    expect(computeSlotStatus({ ...base, bookedRoomCount: 2, isOwnReservation: true })).toBe("reserved");
  });

  it("returns unavailable when every room is booked by someone else", () => {
    expect(computeSlotStatus({ ...base, bookedRoomCount: 2 })).toBe("unavailable");
  });

  it("returns unavailable when the slot is in the past, even if rooms are free", () => {
    expect(computeSlotStatus({ ...base, isPast: true })).toBe("unavailable");
  });

  it("returns unavailable (not tooLate) when both past and would exceed closing", () => {
    expect(computeSlotStatus({ ...base, isPast: true, wouldExceedClosing: true })).toBe("unavailable");
  });

  it("returns tooLate when the chosen duration would run past closing", () => {
    expect(computeSlotStatus({ ...base, wouldExceedClosing: true })).toBe("tooLate");
  });

  it("returns tooLate rather than unavailable even if rooms are also full", () => {
    expect(computeSlotStatus({ ...base, bookedRoomCount: 2, wouldExceedClosing: true })).toBe("tooLate");
  });

  it("returns available when at least one room is free and the slot hasn't passed", () => {
    expect(computeSlotStatus({ ...base, bookedRoomCount: 1 })).toBe("available");
  });

  it("returns available when no rooms are booked and the slot hasn't passed", () => {
    expect(computeSlotStatus(base)).toBe("available");
  });
});
