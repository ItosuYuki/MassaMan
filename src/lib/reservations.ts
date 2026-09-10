import "server-only";
import { db } from "@/lib/db";

export type TherapistReservation = {
  id: string;
  startTime: string;
  endTime: string;
  clientName: string;
  department: string | null;
  note: string | null;
};

type ReservationRow = {
  id: string;
  start_time: string;
  end_time: string;
  client_name: string;
  department_name: string | null;
  requested_note: string | null;
};

const FIND_FOR_THERAPIST_ON_DATE = db.prepare(`
  SELECT
    r.id,
    r.start_time,
    r.end_time,
    u.name AS client_name,
    d.name AS department_name,
    r.requested_note
  FROM reservations r
  JOIN users u ON u.id = r.user_id
  LEFT JOIN departments d ON d.id = u.department_id
  WHERE r.therapist_id = ?
    AND r.reservation_date = ?
    AND r.status = 'confirmed'
  ORDER BY r.start_time
`);

export function getReservationsForTherapist(therapistProfileId: string, dateIso: string): TherapistReservation[] {
  const rows = FIND_FOR_THERAPIST_ON_DATE.all(therapistProfileId, dateIso) as ReservationRow[];
  return rows.map((row) => ({
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    clientName: row.client_name,
    department: row.department_name,
    note: row.requested_note,
  }));
}

const CANCEL_FOR_THERAPIST = db.prepare(`
  UPDATE reservations
  SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now')
  WHERE id = ? AND therapist_id = ? AND status = 'confirmed'
`);

/** Returns true if a confirmed reservation owned by this therapist was cancelled. */
export function cancelReservationForTherapist(reservationId: string, therapistProfileId: string): boolean {
  const result = CANCEL_FOR_THERAPIST.run(reservationId, therapistProfileId);
  return result.changes > 0;
}
