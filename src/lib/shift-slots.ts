// Pure constants/helpers shared by the server-only DB layer (src/lib/shifts.ts)
// and the client-side schedule grid — no "server-only" import here, so client
// components can use these without pulling in node:sqlite.

export type SlotState = "available" | "unavailable" | "break";

export const START_HOUR = 9;
export const END_HOUR = 19; // last slot runs 19:00-20:00; business hours close at 20:00
export const SLOT_COUNT = END_HOUR - START_HOUR + 1;

export function slotStartTime(index: number): string {
  return `${String(START_HOUR + index).padStart(2, "0")}:00`;
}
