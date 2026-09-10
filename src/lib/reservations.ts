import "server-only";
import { db } from "@/lib/db";

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

type ReservationRow = {
  id: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  client_name: string;
  department_name: string | null;
  requested_note: string | null;
  room_name: string | null;
};

const FIND_FOR_THERAPIST_ON_DATE = db.prepare(`
  SELECT
    r.id,
    r.reservation_date,
    r.start_time,
    r.end_time,
    u.name AS client_name,
    d.name AS department_name,
    r.requested_note,
    rm.name AS room_name
  FROM reservations r
  JOIN users u ON u.id = r.user_id
  LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN rooms rm ON rm.id = r.room_id
  WHERE r.therapist_id = ?
    AND r.reservation_date = ?
    AND r.status = 'confirmed'
  ORDER BY r.start_time
`);

function toReservation(row: ReservationRow): TherapistReservation {
  return {
    id: row.id,
    dateIso: row.reservation_date,
    startTime: row.start_time,
    endTime: row.end_time,
    clientName: row.client_name,
    department: row.department_name,
    note: row.requested_note,
    roomName: row.room_name,
  };
}

export function getReservationsForTherapist(therapistProfileId: string, dateIso: string): TherapistReservation[] {
  const rows = FIND_FOR_THERAPIST_ON_DATE.all(therapistProfileId, dateIso) as ReservationRow[];
  return rows.map(toReservation);
}

const CANCEL_FOR_THERAPIST = db.prepare(`
  UPDATE reservations
  SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now')
  WHERE id = ? AND therapist_id = ? AND status = 'confirmed'
`);

/**
 * True once a reservation's own start time has arrived (or passed) — a session
 * that's already underway or over. Mirrors the same "date, then local time of
 * day" comparison the availability grid's own past-time lock uses.
 */
function hasReservationStarted(dateIso: string, startTime: string, now: Date): boolean {
  const todayIso = now.toISOString().slice(0, 10);
  if (dateIso < todayIso) return true;
  if (dateIso > todayIso) return false;
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return startTime <= nowTime;
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
export function cancelReservationForTherapist(reservationId: string, therapistProfileId: string, now: Date = new Date()): CancelResult {
  const row = db
    .prepare(
      `SELECT r.id, r.reservation_date, r.start_time, r.end_time, u.name AS client_name,
              d.name AS department_name, r.requested_note, rm.name AS room_name
       FROM reservations r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN rooms rm ON rm.id = r.room_id
       WHERE r.id = ? AND r.therapist_id = ? AND r.status = 'confirmed'`
    )
    .get(reservationId, therapistProfileId) as ReservationRow | undefined;
  if (!row) return { status: "not_found" };

  const reservation = toReservation(row);
  if (hasReservationStarted(reservation.dateIso, reservation.startTime, now)) {
    return { status: "already_started" };
  }

  const result = CANCEL_FOR_THERAPIST.run(reservationId, therapistProfileId);
  if (result.changes === 0) return { status: "not_found" };
  return { status: "ok", reservation };
}

const FIND_OVERLAPPING_FOR_THERAPIST = db.prepare(`
  SELECT u.name AS client_name FROM reservations r
  JOIN users u ON u.id = r.user_id
  WHERE r.therapist_id = ? AND r.reservation_date = ? AND r.status = 'confirmed' AND r.id != ?
    AND r.start_time < ? AND r.end_time > ?
`);

// A bed is shared across all therapists, so this checks every therapist's
// reservations on that bed — not just this one's — for the new time slot.
const FIND_OVERLAPPING_FOR_ROOM = db.prepare(`
  SELECT u.name AS client_name FROM reservations r
  JOIN users u ON u.id = r.user_id
  WHERE r.room_id = ? AND r.reservation_date = ? AND r.status = 'confirmed' AND r.id != ?
    AND r.start_time < ? AND r.end_time > ?
`);

const RESCHEDULE = db.prepare(`
  UPDATE reservations SET reservation_date = ?, start_time = ?, end_time = ?, updated_at = datetime('now')
  WHERE id = ? AND therapist_id = ? AND status = 'confirmed'
`);

export type RescheduleResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "past" }
  | { status: "conflict"; conflictingClientName: string };

/** Moves a reservation to a new date/start time, keeping its original duration. */
export function rescheduleReservationForTherapist(
  reservationId: string,
  therapistProfileId: string,
  newDateIso: string,
  newStartTime: string,
  now: Date = new Date()
): RescheduleResult {
  const current = db
    .prepare(
      `SELECT reservation_date, start_time, end_time, room_id FROM reservations
       WHERE id = ? AND therapist_id = ? AND status = 'confirmed'`
    )
    .get(reservationId, therapistProfileId) as
    | { reservation_date: string; start_time: string; end_time: string; room_id: string | null }
    | undefined;
  if (!current) return { status: "not_found" };

  // Same rule as cancelling: a session that already started can't be moved
  // either — only the *target* time being in the past was checked before.
  if (hasReservationStarted(current.reservation_date, current.start_time, now)) {
    return { status: "past" };
  }

  const durationMinutes =
    (Number(current.end_time.slice(0, 2)) * 60 + Number(current.end_time.slice(3, 5))) -
    (Number(current.start_time.slice(0, 2)) * 60 + Number(current.start_time.slice(3, 5)));
  const startTotal = Number(newStartTime.slice(0, 2)) * 60 + Number(newStartTime.slice(3, 5));
  const endTotal = startTotal + durationMinutes;
  const newEndTime = `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;

  const therapistConflict = FIND_OVERLAPPING_FOR_THERAPIST.get(
    therapistProfileId,
    newDateIso,
    reservationId,
    newEndTime,
    newStartTime
  ) as { client_name: string } | undefined;
  if (therapistConflict) return { status: "conflict", conflictingClientName: therapistConflict.client_name };

  if (current.room_id) {
    const roomConflict = FIND_OVERLAPPING_FOR_ROOM.get(
      current.room_id,
      newDateIso,
      reservationId,
      newEndTime,
      newStartTime
    ) as { client_name: string } | undefined;
    if (roomConflict) return { status: "conflict", conflictingClientName: roomConflict.client_name };
  }

  RESCHEDULE.run(newDateIso, newStartTime, newEndTime, reservationId, therapistProfileId);
  return { status: "ok" };
}
