import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, therapistProfiles, rooms, reservations, reviews } from "@/db/schema";

export type Gender = "male" | "female";

/** Postgres `time` columns come back as "HH:MM:SS" (see src/lib/db.ts's custom type). */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export async function getUserIdByEmployeeCode(employeeCode: string): Promise<string> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.employeeCode, employeeCode)).limit(1);
  if (!rows[0]) throw new Error(`No user found for employee code ${employeeCode}`);
  return rows[0].id;
}

export async function countRooms(): Promise<number> {
  const rows = await db.select({ id: rooms.id }).from(rooms);
  return rows.length;
}

export type TherapistRow = {
  id: string;
  name: string;
  gender: Gender;
  specialty: string;
  roomId: string | null;
};

/** Active therapists, joined with their user record (name/gender) and fixed room. */
export async function listTherapists(): Promise<TherapistRow[]> {
  const rows = await db
    .select({
      id: therapistProfiles.id,
      name: users.name,
      gender: users.gender,
      specialties: therapistProfiles.specialties,
      roomId: therapistProfiles.roomId,
    })
    .from(therapistProfiles)
    .innerJoin(users, eq(therapistProfiles.userId, users.id))
    .where(eq(therapistProfiles.isActive, true));

  return rows
    .filter((r): r is typeof r & { gender: Gender } => r.gender === "male" || r.gender === "female")
    .map((r) => ({
      id: r.id,
      name: r.name,
      gender: r.gender,
      specialty: (r.specialties ?? []).join("・"),
      roomId: r.roomId,
    }));
}

export type ReservationRow = {
  id: string;
  userId: string;
  therapistId: string;
  roomId: string | null;
  date: string;
  startMinutes: number;
  durationMinutes: number;
  note: string;
};

/** Confirmed reservations across a set of dates, normalized to numeric start/duration. */
export async function listConfirmedReservationsForDates(dateIsos: string[]): Promise<ReservationRow[]> {
  if (dateIsos.length === 0) return [];
  const rows = await db
    .select({
      id: reservations.id,
      userId: reservations.userId,
      therapistId: reservations.therapistId,
      roomId: reservations.roomId,
      date: reservations.reservationDate,
      startTime: reservations.startTime,
      endTime: reservations.endTime,
      note: reservations.requestedNote,
    })
    .from(reservations)
    .where(and(inArray(reservations.reservationDate, dateIsos), eq(reservations.status, "confirmed")));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    therapistId: r.therapistId,
    roomId: r.roomId,
    date: r.date,
    startMinutes: timeToMinutes(r.startTime),
    durationMinutes: timeToMinutes(r.endTime) - timeToMinutes(r.startTime),
    note: r.note ?? "",
  }));
}

export async function listConfirmedReservationsForUser(userId: string): Promise<ReservationRow[]> {
  const rows = await db
    .select({
      id: reservations.id,
      userId: reservations.userId,
      therapistId: reservations.therapistId,
      roomId: reservations.roomId,
      date: reservations.reservationDate,
      startTime: reservations.startTime,
      endTime: reservations.endTime,
      note: reservations.requestedNote,
    })
    .from(reservations)
    .where(and(eq(reservations.userId, userId), eq(reservations.status, "confirmed")));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    therapistId: r.therapistId,
    roomId: r.roomId,
    date: r.date,
    startMinutes: timeToMinutes(r.startTime),
    durationMinutes: timeToMinutes(r.endTime) - timeToMinutes(r.startTime),
    note: r.note ?? "",
  }));
}

export type ReservationWithUserName = ReservationRow & { userName: string };

/** Upcoming-or-past confirmed reservations for one employee, with their name attached
 * — used by the Slack reminder poller, which has no session/request context of its own. */
export async function listConfirmedReservationsForEmployeeCode(
  employeeCode: string
): Promise<ReservationWithUserName[]> {
  const rows = await db
    .select({
      id: reservations.id,
      userId: reservations.userId,
      therapistId: reservations.therapistId,
      roomId: reservations.roomId,
      date: reservations.reservationDate,
      startTime: reservations.startTime,
      endTime: reservations.endTime,
      note: reservations.requestedNote,
      userName: users.name,
    })
    .from(reservations)
    .innerJoin(users, eq(reservations.userId, users.id))
    .where(and(eq(users.employeeCode, employeeCode), eq(reservations.status, "confirmed")));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    therapistId: r.therapistId,
    roomId: r.roomId,
    date: r.date,
    startMinutes: timeToMinutes(r.startTime),
    durationMinutes: timeToMinutes(r.endTime) - timeToMinutes(r.startTime),
    note: r.note ?? "",
    userName: r.userName,
  }));
}

export async function getReservationById(id: string): Promise<ReservationRow | null> {
  const rows = await db
    .select({
      id: reservations.id,
      userId: reservations.userId,
      therapistId: reservations.therapistId,
      roomId: reservations.roomId,
      date: reservations.reservationDate,
      startTime: reservations.startTime,
      endTime: reservations.endTime,
      note: reservations.requestedNote,
    })
    .from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.status, "confirmed")))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    userId: r.userId,
    therapistId: r.therapistId,
    roomId: r.roomId,
    date: r.date,
    startMinutes: timeToMinutes(r.startTime),
    durationMinutes: timeToMinutes(r.endTime) - timeToMinutes(r.startTime),
    note: r.note ?? "",
  };
}

export async function insertReservation(input: {
  userId: string;
  therapistId: string;
  roomId: string | null;
  date: string;
  startMinutes: number;
  durationMinutes: number;
  note: string;
}): Promise<string> {
  const rows = await db
    .insert(reservations)
    .values({
      userId: input.userId,
      therapistId: input.therapistId,
      roomId: input.roomId,
      reservationDate: input.date,
      startTime: minutesToTime(input.startMinutes),
      endTime: minutesToTime(input.startMinutes + input.durationMinutes),
      requestedNote: input.note || null,
    })
    .returning({ id: reservations.id });
  return rows[0].id;
}

export async function cancelReservationById(id: string): Promise<void> {
  await db
    .update(reservations)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(reservations.id, id));
}

export type ReviewRow = { rating: number; comment: string | null };

export async function getReviewForReservation(reservationId: string): Promise<ReviewRow | null> {
  const rows = await db
    .select({ rating: reviews.rating, comment: reviews.comment })
    .from(reviews)
    .where(eq(reviews.reservationId, reservationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getReviewsForReservations(reservationIds: string[]): Promise<Map<string, ReviewRow>> {
  if (reservationIds.length === 0) return new Map();
  const rows = await db
    .select({ reservationId: reviews.reservationId, rating: reviews.rating, comment: reviews.comment })
    .from(reviews)
    .where(inArray(reviews.reservationId, reservationIds));
  return new Map(rows.map((r) => [r.reservationId, { rating: r.rating, comment: r.comment }]));
}

export async function insertReview(reservationId: string, rating: number, comment: string): Promise<void> {
  await db.insert(reviews).values({ reservationId, rating, comment: comment || null });
}
