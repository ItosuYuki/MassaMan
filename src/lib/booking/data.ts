"use server";

import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { reservations, reviews, rooms, therapistProfiles, users } from "@/db/schema";
import { requireRole } from "@/lib/dal";
import { notifyReservationCancelled, notifyReservationCreated } from "@/lib/notifications";
import {
  getWeekDates,
  getTimeSlots,
  formatIsoDate,
  isSlotInPast,
  BUSINESS_DAYS,
  BUSINESS_HOURS,
  CLOSING_TIME_MINUTES,
} from "./schedule";
import { computeSlotStatus, type SlotStatus } from "./availability";
import { computeOccupancyRate } from "./occupancy";
import { autoAssignTherapist, type TherapistCandidate } from "./auto-assign";

/** Post-treatment cleanup buffer: nobody else may book this therapist/room for this long after.
 * Note: this is enforced entirely at the app layer — the DB's `no_overlap_per_therapist` /
 * `no_overlap_per_room` EXCLUDE constraints (see db/schema.sql) only cover the reservation's
 * own [start_time, end_time) range, not this extra buffer, so the buffer must be checked here
 * before insert (the constraints still catch the *exact* overlap case, and any race, as a
 * belt-and-suspenders backstop — see isExclusionViolation below). */
const CLEANUP_BUFFER_MINUTES = 15;

export type Gender = "male" | "female";

type ReservationTimeRow = {
  startMinutes: number;
  durationMinutes: number;
};

function occupiedRange(r: ReservationTimeRow) {
  return { start: r.startMinutes, end: r.startMinutes + r.durationMinutes + CLEANUP_BUFFER_MINUTES };
}

/** Whether a reservation's occupied range (treatment + cleanup buffer) overlaps a 15-min tick. */
function reservationCoversTick(r: ReservationTimeRow, tick: number): boolean {
  const { start, end } = occupiedRange(r);
  return start < tick + 15 && tick < end;
}

/** Whether two [start, end) ranges (in minutes) overlap. */
function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Postgres `time` columns are read back as plain "HH:MM:SS" strings (see src/lib/db.ts). */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}:00`;
}

function pgErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: string }).code
    : undefined;
}

/** Postgres exclusion_violation — thrown by no_overlap_per_therapist / no_overlap_per_room
 * if two requests race past the app-level overlap check above. */
function isExclusionViolation(error: unknown): boolean {
  return pgErrorCode(error) === "23P01";
}

/** Postgres unique_violation — thrown by reviews' one-review-per-reservation constraint. */
function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === "23505";
}

async function currentUserId(employeeCode: string): Promise<string> {
  const row = await db.query.users.findFirst({
    columns: { id: true },
    where: eq(users.employeeCode, employeeCode),
  });
  if (!row) throw new Error("ユーザーが見つかりません。");
  return row.id;
}

async function countRooms(): Promise<number> {
  const rows = await db.select({ id: rooms.id }).from(rooms);
  return rows.length;
}

async function fetchConfirmedReservations(dateIsos: string[]) {
  const rows = await db
    .select({
      id: reservations.id,
      userId: reservations.userId,
      therapistId: reservations.therapistId,
      roomId: reservations.roomId,
      reservationDate: reservations.reservationDate,
      startTime: reservations.startTime,
      endTime: reservations.endTime,
    })
    .from(reservations)
    .where(and(inArray(reservations.reservationDate, dateIsos), eq(reservations.status, "confirmed")));

  return rows.map((r) => ({
    ...r,
    startMinutes: timeToMinutes(r.startTime),
    durationMinutes: timeToMinutes(r.endTime) - timeToMinutes(r.startTime),
  }));
}

export type AvailabilityDay = {
  date: string;
  slots: { startMinutes: number; status: SlotStatus }[];
};

export type AvailabilityResult = {
  days: AvailabilityDay[];
  /** Users may only hold one confirmed reservation per business week. */
  userHasReservationThisWeek: boolean;
};

export async function getAvailability(
  weekStartIso: string,
  durationMinutes: number
): Promise<AvailabilityResult> {
  const session = await requireRole("user");
  const userId = await currentUserId(session.employeeId);
  const anchor = new Date(`${weekStartIso}T00:00:00`);
  const weekDates = getWeekDates(anchor);
  const weekDateIsos = weekDates.map(formatIsoDate);
  const timeSlots = getTimeSlots();
  const now = new Date();

  const [totalRooms, weekReservations] = await Promise.all([
    countRooms(),
    fetchConfirmedReservations(weekDateIsos),
  ]);

  const days = weekDates.map((date) => {
    const dateIso = formatIsoDate(date);
    const dayReservations = weekReservations.filter((r) => r.reservationDate === dateIso);

    const slots = timeSlots.map((tick) => {
      const coveringTick = dayReservations.filter((r) => reservationCoversTick(r, tick));
      const bookedRoomCount = new Set(coveringTick.map((r) => r.roomId)).size;
      const status = computeSlotStatus({
        totalRooms,
        bookedRoomCount,
        isOwnReservation: coveringTick.some((r) => r.userId === userId),
        isPast: isSlotInPast(dateIso, tick, now),
        // Treatment itself (not the cleanup buffer after it) must finish by closing.
        wouldExceedClosing: tick + durationMinutes > CLOSING_TIME_MINUTES,
      });
      return { startMinutes: tick, status };
    });

    return { date: dateIso, slots };
  });

  const userHasReservationThisWeek = weekReservations.some((r) => r.userId === userId);

  return { days, userHasReservationThisWeek };
}

export type TherapistOption = {
  id: string;
  name: string;
  gender: "male" | "female" | "unspecified";
  specialty: string;
  isAvailable: boolean;
  occupancyRate: number;
  isAutoRecommended: boolean;
};

export async function getTherapistCandidates(
  date: string,
  startMinutes: number,
  durationMinutes: number,
  genderFilter: Gender[]
): Promise<TherapistOption[]> {
  await requireRole("user");
  const targetAnchor = new Date(`${date}T00:00:00`);
  const weekDates = getWeekDates(targetAnchor).map(formatIsoDate);
  const hoursPerDay = BUSINESS_HOURS.end - BUSINESS_HOURS.start + 1;

  const [therapistRows, weekReservations] = await Promise.all([
    db
      .select({
        id: therapistProfiles.id,
        name: users.name,
        gender: users.gender,
        specialties: therapistProfiles.specialties,
      })
      .from(therapistProfiles)
      .innerJoin(users, eq(users.id, therapistProfiles.userId))
      .where(and(eq(therapistProfiles.isActive, true), eq(users.isActive, true))),
    fetchConfirmedReservations(weekDates),
  ]);

  const requestedEnd = startMinutes + durationMinutes + CLEANUP_BUFFER_MINUTES;
  const dayReservations = weekReservations.filter((r) => r.reservationDate === date);

  const busyTherapistIds = new Set(
    dayReservations
      .filter((r) => {
        const { start, end } = occupiedRange(r);
        return rangesOverlap(start, end, startMinutes, requestedEnd);
      })
      .map((r) => r.therapistId)
  );

  const options: TherapistOption[] = therapistRows.map((t) => {
    const reservationCountInWeek = weekReservations.filter(
      (r) => r.therapistId === t.id && weekDates.includes(r.reservationDate)
    ).length;
    return {
      id: t.id,
      name: t.name,
      gender: t.gender,
      specialty: (t.specialties ?? []).join("・"),
      isAvailable: !busyTherapistIds.has(t.id),
      occupancyRate: computeOccupancyRate({
        reservationCountInWeek,
        businessDaysPerWeek: BUSINESS_DAYS.length,
        hoursPerDay,
      }),
      isAutoRecommended: false,
    };
  });

  // autoAssignTherapist (ported verbatim, unchanged) only ever compares `gender` for equality/
  // inclusion — it never branches structurally on the literal value — so passing through the
  // DB's third gender value ("unspecified", not present in the current seed data but allowed by
  // the schema) here is safe even though the pure function's own type is narrower.
  const candidates: TherapistCandidate[] = options.map((o) => ({
    id: o.id,
    gender: o.gender as "male" | "female",
    isAvailable: o.isAvailable,
    occupancyRate: o.occupancyRate,
  }));
  const recommendedId = autoAssignTherapist(candidates, genderFilter);

  return options.map((o) => ({ ...o, isAutoRecommended: o.id === recommendedId }));
}

export async function createReservation(input: {
  date: string;
  startMinutes: number;
  durationMinutes: number;
  therapistId: string;
  note?: string;
  autoAssigned: boolean;
}): Promise<{ ok: true; reservationId: string } | { ok: false; error: string }> {
  const session = await requireRole("user");
  const userId = await currentUserId(session.employeeId);

  if (isSlotInPast(input.date, input.startMinutes, new Date())) {
    return { ok: false, error: "過去の日時は予約できません。" };
  }

  if (input.startMinutes + input.durationMinutes > CLOSING_TIME_MINUTES) {
    return { ok: false, error: "この時間帯は営業終了までに施術が終わらないため予約できません。" };
  }

  const requestedWeekIsos = getWeekDates(new Date(`${input.date}T00:00:00`)).map(formatIsoDate);
  const existingThisWeek = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        eq(reservations.userId, userId),
        inArray(reservations.reservationDate, requestedWeekIsos),
        eq(reservations.status, "confirmed")
      )
    )
    .limit(1);
  if (existingThisWeek.length > 0) {
    return { ok: false, error: "1週間に1回までしか予約できません。" };
  }

  const therapist = await db.query.therapistProfiles.findFirst({
    columns: { id: true, isActive: true },
    where: eq(therapistProfiles.id, input.therapistId),
  });
  if (!therapist || !therapist.isActive) {
    return { ok: false, error: "指定された施術者が見つかりません。" };
  }

  const requestedEnd = input.startMinutes + input.durationMinutes + CLEANUP_BUFFER_MINUTES;
  const dayReservations = await fetchConfirmedReservations([input.date]);
  const overlapping = dayReservations.filter((r) => {
    const { start, end } = occupiedRange(r);
    return rangesOverlap(start, end, input.startMinutes, requestedEnd);
  });

  const therapistAlreadyBooked = overlapping.some((r) => r.therapistId === therapist.id);
  if (therapistAlreadyBooked) {
    return { ok: false, error: "この枠は埋まりました。別の枠を選んでください。" };
  }

  const roomRows = await db.select({ id: rooms.id }).from(rooms);
  const bookedRoomIds = new Set(overlapping.map((r) => r.roomId));
  const freeRoom = roomRows.find((room) => !bookedRoomIds.has(room.id));
  if (!freeRoom) {
    return { ok: false, error: "この枠は埋まりました。別の枠を選んでください。" };
  }

  try {
    const [inserted] = await db
      .insert(reservations)
      .values({
        userId,
        therapistId: therapist.id,
        roomId: freeRoom.id,
        reservationDate: input.date,
        startTime: minutesToTime(input.startMinutes),
        endTime: minutesToTime(input.startMinutes + input.durationMinutes),
        requestedNote: input.note || null,
        status: "confirmed",
      })
      .returning({ id: reservations.id });

    await notifyReservationCreated(inserted.id);
    return { ok: true, reservationId: inserted.id };
  } catch (error) {
    if (isExclusionViolation(error)) {
      return { ok: false, error: "この枠は埋まりました。別の枠を選んでください。" };
    }
    throw error;
  }
}

export async function cancelReservation(
  reservationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireRole("user");
  const userId = await currentUserId(session.employeeId);

  const reservation = await db.query.reservations.findFirst({
    columns: { id: true, userId: true, status: true },
    where: eq(reservations.id, reservationId),
  });
  if (!reservation) {
    return { ok: false, error: "予約が見つかりません。" };
  }
  if (reservation.userId !== userId) {
    return { ok: false, error: "この予約をキャンセルする権限がありません。" };
  }
  if (reservation.status !== "confirmed") {
    return { ok: false, error: "この予約はすでにキャンセルされています。" };
  }

  await db
    .update(reservations)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));

  await notifyReservationCancelled(reservationId);

  return { ok: true };
}

/** Finds the current user's reservation covering a given slot, if any — used to open the cancel dialog. */
export async function getOwnReservationAt(
  date: string,
  startMinutes: number
): Promise<{ id: string } | null> {
  const session = await requireRole("user");
  const userId = await currentUserId(session.employeeId);

  const rows = await db
    .select({ id: reservations.id, startTime: reservations.startTime, endTime: reservations.endTime })
    .from(reservations)
    .where(
      and(
        eq(reservations.reservationDate, date),
        eq(reservations.userId, userId),
        eq(reservations.status, "confirmed")
      )
    );

  const match = rows.find((r) =>
    reservationCoversTick(
      { startMinutes: timeToMinutes(r.startTime), durationMinutes: timeToMinutes(r.endTime) - timeToMinutes(r.startTime) },
      startMinutes
    )
  );
  return match ? { id: match.id } : null;
}

export type MyReservation = {
  id: string;
  date: string;
  startMinutes: number;
  durationMinutes: number;
  note: string;
};

/**
 * The current user's not-yet-past reservations, soonest first, for the mypage summary.
 * Once the nearest one's time passes it naturally drops off this list (filtered by
 * isSlotInPast), so the "current" reservation shown always rolls forward on its own.
 */
export async function getMyReservations(limit = 5): Promise<MyReservation[]> {
  const session = await requireRole("user");
  const userId = await currentUserId(session.employeeId);
  const now = new Date();

  const rows = await db
    .select({
      id: reservations.id,
      reservationDate: reservations.reservationDate,
      startTime: reservations.startTime,
      endTime: reservations.endTime,
      requestedNote: reservations.requestedNote,
    })
    .from(reservations)
    .where(and(eq(reservations.userId, userId), eq(reservations.status, "confirmed")));

  return rows
    .map((r) => ({
      id: r.id,
      date: r.reservationDate,
      startMinutes: timeToMinutes(r.startTime),
      durationMinutes: timeToMinutes(r.endTime) - timeToMinutes(r.startTime),
      note: r.requestedNote ?? "",
    }))
    .filter((r) => !isSlotInPast(r.date, r.startMinutes, now))
    .sort((a, b) => (a.date === b.date ? a.startMinutes - b.startMinutes : a.date < b.date ? -1 : 1))
    .slice(0, limit);
}

export type MyReview = { rating: number; comment: string };

export type HistoryEntry = MyReservation & {
  therapistName: string;
  therapistSpecialty: string;
  review: MyReview | null;
};

/** The current user's past reservations, most recent first, for the mypage treatment history.
 * Cancelled reservations are excluded — they were never "treatment received" and can't be
 * reviewed. */
export async function getMyReservationHistory(limit = 5): Promise<HistoryEntry[]> {
  const session = await requireRole("user");
  const userId = await currentUserId(session.employeeId);
  const now = new Date();

  const rows = await db
    .select({
      id: reservations.id,
      reservationDate: reservations.reservationDate,
      startTime: reservations.startTime,
      endTime: reservations.endTime,
      requestedNote: reservations.requestedNote,
      therapistName: users.name,
      specialties: therapistProfiles.specialties,
      reviewRating: reviews.rating,
      reviewComment: reviews.comment,
    })
    .from(reservations)
    .innerJoin(therapistProfiles, eq(therapistProfiles.id, reservations.therapistId))
    .innerJoin(users, eq(users.id, therapistProfiles.userId))
    .leftJoin(reviews, eq(reviews.reservationId, reservations.id))
    .where(and(eq(reservations.userId, userId), ne(reservations.status, "cancelled")));

  return rows
    .map((r) => ({
      id: r.id,
      date: r.reservationDate,
      startMinutes: timeToMinutes(r.startTime),
      durationMinutes: timeToMinutes(r.endTime) - timeToMinutes(r.startTime),
      note: r.requestedNote ?? "",
      therapistName: r.therapistName,
      therapistSpecialty: (r.specialties ?? []).join("・"),
      review: r.reviewRating !== null ? { rating: r.reviewRating, comment: r.reviewComment ?? "" } : null,
    }))
    .filter((r) => isSlotInPast(r.date, r.startMinutes, now))
    .sort((a, b) => (a.date === b.date ? b.startMinutes - a.startMinutes : a.date < b.date ? 1 : -1))
    .slice(0, limit);
}

/**
 * Submits a 1-5 star review (comment optional) for a past reservation of the current
 * user's. One review per reservation (reviews.reservation_id is UNIQUE) — anonymous by
 * design, so no reviewer identity is stored alongside the review itself.
 */
export async function submitReview(
  reservationId: string,
  rating: number,
  comment: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireRole("user");
  const userId = await currentUserId(session.employeeId);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "評価は1〜5の範囲で選択してください。" };
  }

  const reservation = await db.query.reservations.findFirst({
    columns: { id: true, userId: true, status: true, reservationDate: true, startTime: true },
    where: eq(reservations.id, reservationId),
  });
  if (!reservation) {
    return { ok: false, error: "予約が見つかりません。" };
  }
  if (reservation.userId !== userId) {
    return { ok: false, error: "この予約にレビューを投稿する権限がありません。" };
  }
  if (reservation.status === "cancelled") {
    return { ok: false, error: "この予約にはレビューを投稿できません。" };
  }
  if (!isSlotInPast(reservation.reservationDate, timeToMinutes(reservation.startTime), new Date())) {
    return { ok: false, error: "施術が完了してからレビューを投稿できます。" };
  }

  const existing = await db.query.reviews.findFirst({
    columns: { id: true },
    where: eq(reviews.reservationId, reservationId),
  });
  if (existing) {
    return { ok: false, error: "この予約にはすでにレビューが投稿されています。" };
  }

  try {
    await db.insert(reviews).values({ reservationId, rating, comment: comment || null });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "この予約にはすでにレビューが投稿されています。" };
    }
    throw error;
  }

  return { ok: true };
}

export type OpenSlot = { date: string; startMinutes: number };

/**
 * Up to `limit` still-open start times from now onward, checked against real
 * reservation data (room capacity, past-time, closing-time) exactly like the main
 * availability grid — searched across the next 10 business days (today included) so
 * it still finds something to suggest even late in the day, for the mypage
 * recommendation card. Each result carries its own date since it may not be today.
 */
export async function getUpcomingOpenSlots(limit = 2): Promise<OpenSlot[]> {
  await requireRole("user");
  const now = new Date();
  const suggestionDuration = 30;

  const candidateDates: Date[] = [];
  for (let offset = 0, scanned = 0; scanned < 10 && offset < 30; offset++) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    if (BUSINESS_DAYS.includes(d.getDay() as (typeof BUSINESS_DAYS)[number])) {
      candidateDates.push(d);
      scanned++;
    }
  }
  const candidateIsos = candidateDates.map(formatIsoDate);

  const [totalRooms, candidateReservations] = await Promise.all([
    countRooms(),
    fetchConfirmedReservations(candidateIsos),
  ]);

  const open: OpenSlot[] = [];
  for (const date of candidateDates) {
    if (open.length >= limit) break;
    const dateIso = formatIsoDate(date);
    const dayReservations = candidateReservations.filter((r) => r.reservationDate === dateIso);

    for (const tick of getTimeSlots()) {
      if (open.length >= limit) break;
      const coveringTick = dayReservations.filter((r) => reservationCoversTick(r, tick));
      const status = computeSlotStatus({
        totalRooms,
        bookedRoomCount: new Set(coveringTick.map((r) => r.roomId)).size,
        isOwnReservation: false,
        isPast: isSlotInPast(dateIso, tick, now),
        wouldExceedClosing: tick + suggestionDuration > CLOSING_TIME_MINUTES,
      });
      if (status === "available") open.push({ date: dateIso, startMinutes: tick });
    }
  }

  return open;
}
