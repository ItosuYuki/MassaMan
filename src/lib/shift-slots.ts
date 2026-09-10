// Pure constants/helpers shared by the server-only DB layer (src/lib/shifts.ts)
// and the client-side schedule grid — no "server-only" import here, so client
// components can use these without pulling in node:sqlite.

export type SlotState = "available" | "unavailable" | "break";

export const START_HOUR = 9;
export const END_HOUR = 20; // business hours close at 20:00
// 30 min so 休憩/不可 can start or end on a half-hour boundary. Consecutive
// same-state slots still render as one merged band (see buildDayCells in
// schedule-view.tsx), so a whole "available" morning stays a single band —
// the finer grain only shows up at an actual break/unavailable boundary.
export const SLOT_MINUTES = 30;
export const SLOT_COUNT = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;
export const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;

export function slotStartTime(index: number): string {
  const totalMinutes = index * SLOT_MINUTES;
  const hour = START_HOUR + Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** How many leading slots of "today" are already in the past (rounded up to the slot in progress). */
export function currentSlotIndex(now: Date = new Date()): number {
  const minutesSinceOpen = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
  return Math.max(0, Math.min(SLOT_COUNT, Math.ceil(minutesSinceOpen / SLOT_MINUTES)));
}
