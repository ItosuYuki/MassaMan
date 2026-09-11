import "server-only";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { departments, reservations, rooms, users } from "@/db/schema";
import { localDateIso, localTimeHHMM, parseIsoDateLocal, localWeekday, isValidDateIso } from "@/lib/local-date";
import { getDayAvailability } from "@/lib/shifts";
import { START_HOUR, END_HOUR, SLOT_COUNT, slotStartTime } from "@/lib/shift-slots";

/** Postgres `time` columns come back as "HH:MM:SS" (see src/lib/db.ts's custom type) —
 * every comparison below works in plain "HH:MM", so DB reads are normalized here. */
function toHHMM(time: string): string {
  return time.slice(0, 5);
}

export type TherapistReservation = {
  id: string;
  dateIso: string;
  startTime: string;
  endTime: string;
  clientName: string;
  department: string | null;
  note: string | null;
  roomName: string | null;
};

type ReservationJoinRow = {
  id: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  clientName: string;
  departmentName: string | null;
  requestedNote: string | null;
  roomName: string | null;
};

function toReservation(row: ReservationJoinRow): TherapistReservation {
  return {
    id: row.id,
    dateIso: row.reservationDate,
    startTime: toHHMM(row.startTime),
    endTime: toHHMM(row.endTime),
    clientName: row.clientName,
    department: row.departmentName,
    note: row.requestedNote,
    roomName: row.roomName,
  };
}

const reservationJoinSelection = {
  id: reservations.id,
  reservationDate: reservations.reservationDate,
  startTime: reservations.startTime,
  endTime: reservations.endTime,
  clientName: users.name,
  departmentName: departments.name,
  requestedNote: reservations.requestedNote,
  roomName: rooms.name,
};

export async function getReservationsForTherapist(
  therapistProfileId: string,
  dateIso: string
): Promise<TherapistReservation[]> {
  const rows = await db
    .select(reservationJoinSelection)
    .from(reservations)
    .innerJoin(users, eq(users.id, reservations.userId))
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .leftJoin(rooms, eq(rooms.id, reservations.roomId))
    .where(
      and(
        eq(reservations.therapistId, therapistProfileId),
        eq(reservations.reservationDate, dateIso),
        eq(reservations.status, "confirmed")
      )
    )
    .orderBy(reservations.startTime);

  return rows.map(toReservation);
}

/**
 * True once a reservation's own start time has arrived (or passed) — a session
 * that's already underway or over. Mirrors the same "date, then local time of
 * day" comparison the availability grid's own past-time lock uses.
 */
function hasReservationStarted(dateIso: string, startTime: string, now: Date): boolean {
  const todayIso = localDateIso(now);
  if (dateIso < todayIso) return true;
  if (dateIso > todayIso) return false;
  return startTime <= localTimeHHMM(now);
}

export type CancelResult =
  | { status: "ok"; reservation: TherapistReservation }
  | { status: "not_found" }
  | { status: "already_started" };

/**
 * Cancels a reservation on the therapist's own behalf — refused once the
 * reservation has already started, since "cancelling" a session that already
 * happened (or is happening) doesn't mean anything.
 */
export async function cancelReservationForTherapist(
  reservationId: string,
  therapistProfileId: string,
  now: Date = new Date()
): Promise<CancelResult> {
  const rows = await db
    .select(reservationJoinSelection)
    .from(reservations)
    .innerJoin(users, eq(users.id, reservations.userId))
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .leftJoin(rooms, eq(rooms.id, reservations.roomId))
    .where(
      and(
        eq(reservations.id, reservationId),
        eq(reservations.therapistId, therapistProfileId),
        eq(reservations.status, "confirmed")
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return { status: "not_found" };

  const reservation = toReservation(row);
  if (hasReservationStarted(reservation.dateIso, reservation.startTime, now)) {
    return { status: "already_started" };
  }

  const result = await db
    .update(reservations)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(reservations.id, reservationId),
        eq(reservations.therapistId, therapistProfileId),
        eq(reservations.status, "confirmed")
      )
    )
    .returning({ id: reservations.id });
  if (result.length === 0) return { status: "not_found" };
  return { status: "ok", reservation };
}

/**
 * True only if every slot the reservation's new [startTime, endTime) touches
 * is "available" on that day for this therapist — i.e. not a break, not
 * marked unavailable, and not outside their working hours. Only defends
 * against the *availability grid*; overlapping another reservation is
 * checked separately (findOverlappingForTherapist/Room).
 */
async function isRangeAvailable(
  therapistProfileId: string,
  dateIso: string,
  startTime: string,
  endTime: string
): Promise<boolean> {
  const slots = await getDayAvailability(therapistProfileId, dateIso);
  for (let i = 0; i < SLOT_COUNT; i++) {
    const slotStart = slotStartTime(i);
    const slotEnd = slotStartTime(i + 1);
    if (slotStart < endTime && slotEnd > startTime && slots[i] !== "available") {
      return false;
    }
  }
  return true;
}

const BUSINESS_HOURS_START = `${String(START_HOUR).padStart(2, "0")}:00`;
const BUSINESS_HOURS_END = `${String(END_HOUR).padStart(2, "0")}:00`;

const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function findOverlappingForTherapist(
  therapistProfileId: string,
  dateIso: string,
  excludeReservationId: string,
  newEndTime: string,
  newStartTime: string
): Promise<{ clientName: string } | null> {
  const rows = await db
    .select({ clientName: users.name })
    .from(reservations)
    .innerJoin(users, eq(users.id, reservations.userId))
    .where(
      and(
        eq(reservations.therapistId, therapistProfileId),
        eq(reservations.reservationDate, dateIso),
        eq(reservations.status, "confirmed"),
        ne(reservations.id, excludeReservationId),
        lt(reservations.startTime, newEndTime),
        gt(reservations.endTime, newStartTime)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

// A bed is shared across all therapists, so this checks every therapist's
// reservations on that bed — not just this one's — for the new time slot.
async function findOverlappingForRoom(
  roomId: string,
  dateIso: string,
  excludeReservationId: string,
  newEndTime: string,
  newStartTime: string
): Promise<{ clientName: string } | null> {
  const rows = await db
    .select({ clientName: users.name })
    .from(reservations)
    .innerJoin(users, eq(users.id, reservations.userId))
    .where(
      and(
        eq(reservations.roomId, roomId),
        eq(reservations.reservationDate, dateIso),
        eq(reservations.status, "confirmed"),
        ne(reservations.id, excludeReservationId),
        lt(reservations.startTime, newEndTime),
        gt(reservations.endTime, newStartTime)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export type RescheduleResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "past" }
  | { status: "invalid_time" }
  | { status: "conflict"; conflictingClientName: string };

/** Moves a reservation to a new date/start time, keeping its original duration. */
export async function rescheduleReservationForTherapist(
  reservationId: string,
  therapistProfileId: string,
  newDateIso: string,
  newStartTime: string,
  now: Date = new Date()
): Promise<RescheduleResult> {
  // A Server Action must validate its own inputs regardless of what the UI's
  // <input type="date">/<input type="time"> constrain — a direct call (or a
  // modified/replayed request) can send anything.
  if (!isValidDateIso(newDateIso) || !TIME_HHMM_RE.test(newStartTime)) {
    return { status: "invalid_time" };
  }
  // The target date/time being in the past belongs here, not only in the
  // calling Server Action — this function has to be safe to call on its own,
  // not merely safe behind whatever check its one current caller happens to
  // add first.
  if (newDateIso < localDateIso(now) || (newDateIso === localDateIso(now) && newStartTime <= localTimeHHMM(now))) {
    return { status: "past" };
  }

  const currentRows = await db
    .select({
      reservationDate: reservations.reservationDate,
      startTime: reservations.startTime,
      endTime: reservations.endTime,
      roomId: reservations.roomId,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.id, reservationId),
        eq(reservations.therapistId, therapistProfileId),
        eq(reservations.status, "confirmed")
      )
    )
    .limit(1);
  const currentRow = currentRows[0];
  if (!currentRow) return { status: "not_found" };
  const current = {
    reservationDate: currentRow.reservationDate,
    startTime: toHHMM(currentRow.startTime),
    endTime: toHHMM(currentRow.endTime),
    roomId: currentRow.roomId,
  };

  // Same rule as cancelling: a session that already started can't be moved
  // either — only the *target* time being in the past was checked before.
  if (hasReservationStarted(current.reservationDate, current.startTime, now)) {
    return { status: "past" };
  }

  const durationMinutes =
    (Number(current.endTime.slice(0, 2)) * 60 + Number(current.endTime.slice(3, 5))) -
    (Number(current.startTime.slice(0, 2)) * 60 + Number(current.startTime.slice(3, 5)));
  const startTotal = Number(newStartTime.slice(0, 2)) * 60 + Number(newStartTime.slice(3, 5));
  const endTotal = startTotal + durationMinutes;
  const newEndTime = `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;

  // The UI only offers weekdays within business hours, but a Server Action
  // has to assume nothing about how it was called — a Sunday, a 03:00 start,
  // or a start that pushes the end past closing must all be rejected here,
  // not just have their target slots checked below (a 19:30 start for a
  // 45min visit ends at 20:15, outside the grid entirely).
  const weekday = localWeekday(parseIsoDateLocal(newDateIso));
  const isWeekday = weekday >= 1 && weekday <= 5;
  const withinBusinessHours = newStartTime >= BUSINESS_HOURS_START && newEndTime <= BUSINESS_HOURS_END;
  if (
    !isWeekday ||
    !withinBusinessHours ||
    !(await isRangeAvailable(therapistProfileId, newDateIso, newStartTime, newEndTime))
  ) {
    return { status: "invalid_time" };
  }

  const therapistConflict = await findOverlappingForTherapist(
    therapistProfileId,
    newDateIso,
    reservationId,
    newEndTime,
    newStartTime
  );
  if (therapistConflict) return { status: "conflict", conflictingClientName: therapistConflict.clientName };

  if (current.roomId) {
    const roomConflict = await findOverlappingForRoom(current.roomId, newDateIso, reservationId, newEndTime, newStartTime);
    if (roomConflict) return { status: "conflict", conflictingClientName: roomConflict.clientName };
  }

  // Between the SELECT above and here, another request could have cancelled
  // this same reservation — without checking the result, that race would
  // still report "ok" while the DB silently kept the old date/time.
  const result = await db
    .update(reservations)
    .set({ reservationDate: newDateIso, startTime: newStartTime, endTime: newEndTime, updatedAt: new Date() })
    .where(
      and(
        eq(reservations.id, reservationId),
        eq(reservations.therapistId, therapistProfileId),
        eq(reservations.status, "confirmed")
      )
    )
    .returning({ id: reservations.id });
  if (result.length === 0) return { status: "not_found" };
  return { status: "ok" };
}
