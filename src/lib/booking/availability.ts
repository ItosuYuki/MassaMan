export type SlotStatus = "reserved" | "available" | "full";

/**
 * `reserved` = the current user already booked this slot (shown as ✓ in their own color).
 * `full` = every room is taken by someone else (✕).
 * `available` = at least one room is free (◯).
 */
export function computeSlotStatus(params: {
  totalRooms: number;
  bookedRoomCount: number;
  isOwnReservation: boolean;
}): SlotStatus {
  if (params.isOwnReservation) return "reserved";
  if (params.bookedRoomCount >= params.totalRooms) return "full";
  return "available";
}
