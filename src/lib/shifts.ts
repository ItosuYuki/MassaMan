import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type DbClient } from "@/lib/db";
import { therapistBreaks, therapistShifts } from "@/db/schema";
import { SLOT_COUNT, slotStartTime, type SlotState } from "@/lib/shift-slots";

export type { SlotState } from "@/lib/shift-slots";

/** Postgres `time` columns come back as "HH:MM:SS" (see src/lib/db.ts's custom type) —
 * every comparison/lookup below works in plain "HH:MM", so DB reads are normalized here. */
function toHHMM(time: string): string {
  return time.slice(0, 5);
}

type ShiftRow = { id: string; startTime: string; endTime: string };
type BreakRow = { breakStart: string; breakEnd: string; kind: SlotState; label: string | null };

async function findShift(dbClient: DbClient, therapistProfileId: string, dateIso: string): Promise<ShiftRow | null> {
  const rows = await dbClient
    .select({ id: therapistShifts.id, startTime: therapistShifts.startTime, endTime: therapistShifts.endTime })
    .from(therapistShifts)
    .where(and(eq(therapistShifts.therapistId, therapistProfileId), eq(therapistShifts.workDate, dateIso)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, startTime: toHHMM(row.startTime), endTime: toHHMM(row.endTime) };
}

async function findBreaksForShift(dbClient: DbClient, shiftId: string): Promise<BreakRow[]> {
  const rows = await dbClient
    .select({ breakStart: therapistBreaks.breakStart, breakEnd: therapistBreaks.breakEnd, kind: therapistBreaks.kind, label: therapistBreaks.label })
    .from(therapistBreaks)
    .where(eq(therapistBreaks.shiftId, shiftId));
  return rows.map((r) => ({ breakStart: toHHMM(r.breakStart), breakEnd: toHHMM(r.breakEnd), kind: r.kind, label: r.label }));
}

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
export async function getDaySchedule(
  therapistProfileId: string,
  dateIso: string,
  dbClient: DbClient = db
): Promise<DaySchedule> {
  const shift = await findShift(dbClient, therapistProfileId, dateIso);
  if (!shift) return defaultDaySchedule();

  const slots: SlotState[] = Array(SLOT_COUNT).fill("unavailable");
  const labels: (string | null)[] = Array(SLOT_COUNT).fill(null);

  const breaks = await findBreaksForShift(dbClient, shift.id);
  for (let i = 0; i < SLOT_COUNT; i++) {
    const start = slotStartTime(i);
    const end = slotStartTime(i + 1);
    if (start >= shift.startTime && start < shift.endTime) {
      const covering = breaks.find((b) => start < b.breakEnd && end > b.breakStart);
      slots[i] = covering ? covering.kind : "available";
      labels[i] = covering && covering.kind === "unavailable" ? covering.label : null;
    }
  }
  return { slots, labels };
}

/** Convenience wrapper for callers that only ever cared about the state, not the "その他" reason text. */
export async function getDayAvailability(
  therapistProfileId: string,
  dateIso: string,
  dbClient: DbClient = db
): Promise<SlotState[]> {
  return (await getDaySchedule(therapistProfileId, dateIso, dbClient)).slots;
}

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
 *
 * Pass `dbClient` as a transaction (from `db.transaction(async (tx) => ...)`)
 * when saving several days together, so a failure partway through rolls back
 * every day's write instead of leaving some days saved and others not.
 */
export async function saveDayAvailability(
  therapistProfileId: string,
  dateIso: string,
  slots: SlotState[],
  labels: (string | null)[] = [],
  dbClient: DbClient = db
): Promise<void> {
  const existing = await findShift(dbClient, therapistProfileId, dateIso);
  if (existing) {
    await dbClient.delete(therapistBreaks).where(eq(therapistBreaks.shiftId, existing.id));
    await dbClient
      .delete(therapistShifts)
      .where(and(eq(therapistShifts.therapistId, therapistProfileId), eq(therapistShifts.workDate, dateIso)));
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

  const [{ id: shiftId }] = await dbClient
    .insert(therapistShifts)
    .values({
      therapistId: therapistProfileId,
      workDate: dateIso,
      startTime: slotStartTime(rangeStart),
      endTime: slotStartTime(rangeEnd + 1),
    })
    .returning({ id: therapistShifts.id });

  const labelAt = (i: number): string | null => (labels[i]?.trim() ? labels[i] : null);

  const breakRows: (typeof therapistBreaks.$inferInsert)[] = [];
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
    breakRows.push({
      shiftId,
      breakStart: slotStartTime(runStart),
      breakEnd: slotStartTime(i),
      kind: kind as "break" | "unavailable",
      label,
    });
  }

  if (breakRows.length > 0) {
    await dbClient.insert(therapistBreaks).values(breakRows);
  }
}

/**
 * Marks [rangeStart, rangeEnd) as "unavailable" ("その他") for this therapist on
 * this day — used when a therapist cancels a reservation for their own
 * reasons (as opposed to a client cancelling): unlike a client cancellation,
 * the therapist isn't available for anyone else in that slot either. Leaves
 * the rest of the day's availability (and every other slot's label) untouched.
 */
export async function markRangeUnavailable(
  therapistProfileId: string,
  dateIso: string,
  rangeStart: string,
  rangeEnd: string,
  dbClient: DbClient = db
): Promise<void> {
  const { slots, labels } = await getDaySchedule(therapistProfileId, dateIso, dbClient);
  for (let i = 0; i < SLOT_COUNT; i++) {
    const slotStart = slotStartTime(i);
    const slotEnd = slotStartTime(i + 1);
    if (slotStart < rangeEnd && slotEnd > rangeStart) {
      slots[i] = "unavailable";
      labels[i] = "予約キャンセル";
    }
  }
  await saveDayAvailability(therapistProfileId, dateIso, slots, labels, dbClient);
}
