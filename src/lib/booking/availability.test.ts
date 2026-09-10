import { describe, expect, it } from "vitest";
import { computeSlotStatus } from "./availability";

describe("computeSlotStatus", () => {
  it("returns reserved when the current user already booked this slot", () => {
    expect(computeSlotStatus({ totalRooms: 2, bookedRoomCount: 1, isOwnReservation: true })).toBe("reserved");
  });

  it("returns reserved even if every room happens to be booked, when one is the user's own", () => {
    expect(computeSlotStatus({ totalRooms: 2, bookedRoomCount: 2, isOwnReservation: true })).toBe("reserved");
  });

  it("returns full when every room is booked by someone else", () => {
    expect(computeSlotStatus({ totalRooms: 2, bookedRoomCount: 2, isOwnReservation: false })).toBe("full");
  });

  it("returns available when at least one room is free", () => {
    expect(computeSlotStatus({ totalRooms: 2, bookedRoomCount: 1, isOwnReservation: false })).toBe("available");
  });

  it("returns available when no rooms are booked", () => {
    expect(computeSlotStatus({ totalRooms: 2, bookedRoomCount: 0, isOwnReservation: false })).toBe("available");
  });
});
