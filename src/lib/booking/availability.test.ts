import { describe, expect, it } from "vitest";
import { computeSlotStatus } from "./availability";

describe("computeSlotStatus", () => {
  it("returns reserved when the current user already booked this slot", () => {
    expect(
      computeSlotStatus({ totalRooms: 2, bookedRoomCount: 1, isOwnReservation: true, isPast: false })
    ).toBe("reserved");
  });

  it("returns reserved even if every room happens to be booked, when one is the user's own", () => {
    expect(
      computeSlotStatus({ totalRooms: 2, bookedRoomCount: 2, isOwnReservation: true, isPast: false })
    ).toBe("reserved");
  });

  it("returns unavailable when every room is booked by someone else", () => {
    expect(
      computeSlotStatus({ totalRooms: 2, bookedRoomCount: 2, isOwnReservation: false, isPast: false })
    ).toBe("unavailable");
  });

  it("returns unavailable when the slot is in the past, even if rooms are free", () => {
    expect(
      computeSlotStatus({ totalRooms: 2, bookedRoomCount: 0, isOwnReservation: false, isPast: true })
    ).toBe("unavailable");
  });

  it("returns available when at least one room is free and the slot hasn't passed", () => {
    expect(
      computeSlotStatus({ totalRooms: 2, bookedRoomCount: 1, isOwnReservation: false, isPast: false })
    ).toBe("available");
  });

  it("returns available when no rooms are booked and the slot hasn't passed", () => {
    expect(
      computeSlotStatus({ totalRooms: 2, bookedRoomCount: 0, isOwnReservation: false, isPast: false })
    ).toBe("available");
  });
});
