import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { SLOT_COUNT, slotStartTime, type SlotState } from "@/lib/shift-slots";

export type { SlotState } from "@/lib/shift-slots";

type ShiftRow = { id: string; start_time: string; end_time: string };
type BreakRow = { break_start: string; break_end: string; kind: SlotState; label: string | null };

const FIND_SHIFT = db.prepare(`
  SELECT id, start_time, end_time FROM therapist_shifts WHERE therapist_id = ? AND work_date = ?
`);
const FIND_BREAKS_FOR_SHIFT = db.prepare(`
  SELECT break_start, break_end, kind, label FROM therapist_breaks WHERE shift_id = ?
`);

export type DaySchedule = { slots: SlotState[]; labels: (string | null)[] };

// A day nobody has ever saved a shift for defaults to fully "available"
// (therapists are assumed on duty during business hours unless they mark an
// exception) — except the 14:00–15:00 lunch slot, which most therapists take
// anyway, so it starts as "休憩" instead of making everyone paint it in by hand.
const DEFAULT_BREAK_START = "14:00";
const DEFAULT_BREAK_END = "15:00";

function defaultDaySchedule(): DaySchedule {
  const slots: SlotState[] = Array(SLOT_COUNT).fill("available");
  for (let i = 0; i < SLOT_COUNT; i++) {
    const start = slotStartTime(i);
    if (start >= DEFAULT_BREAK_START && start < DEFAULT_BREAK_END) {
      slots[i] = "break";
    }
  }
  return { slots, labels: Array(SLOT_COUNT).fill(null) };
}

/**
 * Reconstructs the tri-state grid (plus each "その他" slot's free-text reason)
 * from the DB's two-level shift+break model: slots outside [start_time,
 * end_time) are "unavailable", slots inside covered by a therapist_breaks row
 * take that row's own kind ("break" or "unavailable" — see
 * saveDayAvailability) and, for "unavailable", its label, everything else
 * inside the range is "available".
 */
export function getDaySchedule(therapistProfileId: string, dateIso: string): DaySchedule {
  const shift = FIND_SHIFT.get(therapistProfileId, dateIso) as ShiftRow | undefined;
  if (!shift) return defaultDaySchedule();

  const slots: SlotState[] = Array(SLOT_COUNT).fill("unavailable");
  const labels: (string | null)[] = Array(SLOT_COUNT).fill(null);

  const breaks = FIND_BREAKS_FOR_SHIFT.all(shift.id) as BreakRow[];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const start = slotStartTime(i);
    const end = slotStartTime(i + 1);
    if (start >= shift.start_time && start < shift.end_time) {
      const covering = breaks.find((b) => start < b.break_end && end > b.break_start);
      slots[i] = covering ? covering.kind : "available";
      labels[i] = covering && covering.kind === "unavailable" ? covering.label : null;
    }
  }
  return { slots, labels };
}

/** Convenience wrapper for callers that only ever cared about the state, not the "その他" reason text. */
export function getDayAvailability(therapistProfileId: string, dateIso: string): SlotState[] {
  return getDaySchedule(therapistProfileId, dateIso).slots;
}

const DELETE_BREAKS_FOR_SHIFT = db.prepare(`DELETE FROM therapist_breaks WHERE shift_id = ?`);
const DELETE_SHIFT = db.prepare(`DELETE FROM therapist_shifts WHERE therapist_id = ? AND work_date = ?`);
const INSERT_SHIFT = db.prepare(`
  INSERT INTO therapist_shifts (id, therapist_id, work_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)
`);
const INSERT_BREAK = db.prepare(`
  INSERT INTO therapist_breaks (id, shift_id, break_start, break_end, kind, label) VALUES (?, ?, ?, ?, ?, ?)
`);

/**
 * Persists one day's tri-state grid, plus each "その他" (unavailable) run's
 * free-text reason. "unavailable" and "break" slots inside the resulting
 * shift range both become therapist_breaks rows, tagged with their own
 * `kind` so getDaySchedule can tell them apart again on read — a run of
 * "unavailable" slots splits into separate rows wherever its label changes,
 * even without a state change, so two differently-labeled "その他" blocks
 * painted back to back never get silently merged into one reason.
 *
 * A day with zero "available" slots (the therapist painted the whole day
 * その他/休憩, e.g. a day off) still gets a shift row spanning the full business
 * day, with every slot recorded as its own break/unavailable run — otherwise
 * no shift row would exist at all and the next load would fall back to the
 * "no saved shift" default, silently discarding the day off.
 */
export function saveDayAvailability(
  therapistProfileId: string,
  dateIso: string,
  slots: SlotState[],
  labels: (string | null)[] = []
): void {
  const existing = FIND_SHIFT.get(therapistProfileId, dateIso) as ShiftRow | undefined;
  if (existing) {
    DELETE_BREAKS_FOR_SHIFT.run(existing.id);
    DELETE_SHIFT.run(therapistProfileId, dateIso);
  }

  const firstAvailable = slots.findIndex((s) => s === "available");

  let lastAvailable = firstAvailable;
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i] === "available") {
      lastAvailable = i;
      break;
    }
  }

  const rangeStart = firstAvailable === -1 ? 0 : firstAvailable;
  const rangeEnd = firstAvailable === -1 ? slots.length - 1 : lastAvailable;

  const shiftId = randomUUID();
  INSERT_SHIFT.run(shiftId, therapistProfileId, dateIso, slotStartTime(rangeStart), slotStartTime(rangeEnd + 1));

  const labelAt = (i: number): string | null => (labels[i]?.trim() ? labels[i] : null);

  let i = rangeStart;
  while (i <= rangeEnd) {
    if (slots[i] === "available") {
      i++;
      continue;
    }
    const kind = slots[i];
    const label = kind === "unavailable" ? labelAt(i) : null;
    const runStart = i;
    while (i <= rangeEnd && slots[i] === kind && (kind !== "unavailable" || labelAt(i) === label)) i++;
    INSERT_BREAK.run(randomUUID(), shiftId, slotStartTime(runStart), slotStartTime(i), kind, label);
  }
}

/**
 * Marks [rangeStart, rangeEnd) as "unavailable" ("その他") for this therapist on
 * this day — used when a therapist cancels a reservation for their own
 * reasons (as opposed to a client cancelling): unlike a client cancellation,
 * the therapist isn't available for anyone else in that slot either. Leaves
 * the rest of the day's availability (and every other slot's label) untouched.
 */
export function markRangeUnavailable(
  therapistProfileId: string,
  dateIso: string,
  rangeStart: string,
  rangeEnd: string
): void {
  const { slots, labels } = getDaySchedule(therapistProfileId, dateIso);
  for (let i = 0; i < SLOT_COUNT; i++) {
    const slotStart = slotStartTime(i);
    const slotEnd = slotStartTime(i + 1);
    if (slotStart < rangeEnd && slotEnd > rangeStart) {
      slots[i] = "unavailable";
      labels[i] = "予約キャンセル";
    }
  }
  saveDayAvailability(therapistProfileId, dateIso, slots, labels);
}
