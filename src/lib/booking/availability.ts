export type SlotStatus = "reserved" | "available" | "unavailable";

/**
 * `reserved` = the current user already booked this slot (shown as ✓ in their own color).
 * `unavailable` = not bookable — either every room is already taken, or the slot is in the
 * past (shown as ✕, labeled "予約不可" rather than a "full"-specific label since either
 * reason lands here).
 * `available` = at least one room is free and the slot hasn't passed yet (◯).
 */
export function computeSlotStatus(params: {
  totalRooms: number;
  bookedRoomCount: number;
  isOwnReservation: boolean;
  isPast: boolean;
}): SlotStatus {
  if (params.isOwnReservation) return "reserved";
  if (params.isPast || params.bookedRoomCount >= params.totalRooms) return "unavailable";
  return "available";
}
