import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { SLOT_COUNT, slotStartTime, type SlotState } from "@/lib/shift-slots";

export type { SlotState } from "@/lib/shift-slots";

type ShiftRow = { id: string; start_time: string; end_time: string };
type BreakRow = { break_start: string; break_end: string };

const FIND_SHIFT = db.prepare(`
  SELECT id, start_time, end_time FROM therapist_shifts WHERE therapist_id = ? AND work_date = ?
`);
const FIND_BREAKS_FOR_SHIFT = db.prepare(`
  SELECT break_start, break_end FROM therapist_breaks WHERE shift_id = ?
`);

/**
 * Reconstructs the tri-state grid from the DB's two-level shift+break model:
 * slots outside [start_time, end_time) are "unavailable", slots inside covered
 * by a break are "break", everything else inside the range is "available".
 *
 * A day with no saved shift yet defaults to fully "available" (therapists are
 * assumed on duty during business hours unless they mark an exception), rather
 * than fully "unavailable".
 */
export function getDayAvailability(therapistProfileId: string, dateIso: string): SlotState[] {
  const shift = FIND_SHIFT.get(therapistProfileId, dateIso) as ShiftRow | undefined;
  if (!shift) return Array(SLOT_COUNT).fill("available");

  const slots: SlotState[] = Array(SLOT_COUNT).fill("unavailable");

  const breaks = FIND_BREAKS_FOR_SHIFT.all(shift.id) as BreakRow[];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const start = slotStartTime(i);
    const end = slotStartTime(i + 1);
    if (start >= shift.start_time && start < shift.end_time) {
      const inBreak = breaks.some((b) => start < b.break_end && end > b.break_start);
      slots[i] = inBreak ? "break" : "available";
    }
  }
  return slots;
}

const DELETE_BREAKS_FOR_SHIFT = db.prepare(`DELETE FROM therapist_breaks WHERE shift_id = ?`);
const DELETE_SHIFT = db.prepare(`DELETE FROM therapist_shifts WHERE therapist_id = ? AND work_date = ?`);
const INSERT_SHIFT = db.prepare(`
  INSERT INTO therapist_shifts (id, therapist_id, work_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)
`);
const INSERT_BREAK = db.prepare(`
  INSERT INTO therapist_breaks (id, shift_id, break_start, break_end) VALUES (?, ?, ?, ?)
`);

/**
 * Persists one day's tri-state grid. "unavailable" and "break" slots inside the
 * resulting shift range both become therapist_breaks rows (see the shared
 * "不可セルの扱い" note): the DB only distinguishes "not part of the working
 * range" from "part of it but blocked", not why a slot is blocked.
 */
export function saveDayAvailability(therapistProfileId: string, dateIso: string, slots: SlotState[]): void {
  const existing = FIND_SHIFT.get(therapistProfileId, dateIso) as ShiftRow | undefined;
  if (existing) {
    DELETE_BREAKS_FOR_SHIFT.run(existing.id);
    DELETE_SHIFT.run(therapistProfileId, dateIso);
  }

  const firstAvailable = slots.findIndex((s) => s === "available");
  if (firstAvailable === -1) return; // no working hours this day

  let lastAvailable = firstAvailable;
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i] === "available") {
      lastAvailable = i;
      break;
    }
  }

  const shiftId = randomUUID();
  INSERT_SHIFT.run(shiftId, therapistProfileId, dateIso, slotStartTime(firstAvailable), slotStartTime(lastAvailable + 1));

  let i = firstAvailable;
  while (i <= lastAvailable) {
    if (slots[i] !== "available") {
      const breakStartIndex = i;
      while (i <= lastAvailable && slots[i] !== "available") i++;
      INSERT_BREAK.run(randomUUID(), shiftId, slotStartTime(breakStartIndex), slotStartTime(i));
    } else {
      i++;
    }
  }
}

/**
 * Marks [rangeStart, rangeEnd) as "unavailable" for this therapist on this day —
 * used when a therapist cancels a reservation for their own reasons (as opposed
 * to a client cancelling): unlike a client cancellation, the therapist isn't
 * available for anyone else in that slot either. Leaves the rest of the day's
 * availability untouched.
 */
export function markRangeUnavailable(
  therapistProfileId: string,
  dateIso: string,
  rangeStart: string,
  rangeEnd: string
): void {
  const slots = getDayAvailability(therapistProfileId, dateIso);
  for (let i = 0; i < SLOT_COUNT; i++) {
    const slotStart = slotStartTime(i);
    const slotEnd = slotStartTime(i + 1);
    if (slotStart < rangeEnd && slotEnd > rangeStart) {
      slots[i] = "unavailable";
    }
  }
  saveDayAvailability(therapistProfileId, dateIso, slots);
}
