export type SlotStatus = "reserved" | "available" | "unavailable" | "tooLate";

/**
 * `reserved` = the current user already booked this slot (shown as ✓ in their own color).
 * `tooLate` = the slot itself hasn't passed, but starting a treatment here (with the
 * currently selected duration + 15min cleanup buffer) would run past the 19:45 close —
 * shown distinctly (△) from a plain unavailable slot.
 * `unavailable` = not bookable — either every room is already taken, or the slot itself
 * is in the past (✕, labeled "予約不可").
 * `available` = at least one room is free, the slot hasn't passed, and it fits before
 * closing (◯).
 */
export function computeSlotStatus(params: {
  totalRooms: number;
  bookedRoomCount: number;
  isOwnReservation: boolean;
  isPast: boolean;
  wouldExceedClosing: boolean;
}): SlotStatus {
  if (params.isOwnReservation) return "reserved";
  if (params.isPast) return "unavailable";
  if (params.wouldExceedClosing) return "tooLate";
  if (params.bookedRoomCount >= params.totalRooms) return "unavailable";
  return "available";
}
