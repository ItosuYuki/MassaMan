"use server";

import { requireRole } from "@/lib/dal";
import {
  getWeekDates,
  getTimeSlots,
  formatIsoDate,
  formatTimeLabel,
  isSlotInPast,
  BUSINESS_DAYS,
  BUSINESS_HOURS,
  SLOT_STEP_MINUTES,
  CLOSING_TIME_MINUTES,
} from "./schedule";
import { computeSlotStatus, type SlotStatus } from "./availability";
import { computeOccupancyRate } from "./occupancy";
import { autoAssignTherapist, type TherapistCandidate } from "./auto-assign";
import {
  type Gender,
  type ReservationRow,
  getUserIdByEmployeeCode,
  countRooms,
  listTherapists,
  listConfirmedReservationsForDates,
  listConfirmedReservationsForUser,
  getReservationById,
  insertReservation,
  cancelReservationById,
  getReviewForReservation,
  getReviewsForReservations,
  insertReview,
} from "./repo";
import { sendSlackMessage } from "@/lib/notifications/slack";

/** Post-treatment cleanup buffer: nobody else may book this therapist/room for this long after. */
const CLEANUP_BUFFER_MINUTES = 15;

function occupiedRange(r: Pick<ReservationRow, "startMinutes" | "durationMinutes">) {
  return { start: r.startMinutes, end: r.startMinutes + r.durationMinutes + CLEANUP_BUFFER_MINUTES };
}

/** Whether a reservation's occupied range (treatment + cleanup buffer) overlaps a 15-min tick. */
function reservationCoversTick(r: Pick<ReservationRow, "startMinutes" | "durationMinutes">, tick: number): boolean {
  const { start, end } = occupiedRange(r);
  return start < tick + SLOT_STEP_MINUTES && tick < end;
}

/** Whether two [start, end) ranges (in minutes) overlap. */
function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
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
  const userId = await getUserIdByEmployeeCode(session.employeeId);
  const anchor = new Date(`${weekStartIso}T00:00:00`);
  const weekDates = getWeekDates(anchor);
  const weekDateIsos = weekDates.map(formatIsoDate);
  const timeSlots = getTimeSlots();
  const totalRooms = await countRooms();
  const weekReservations = await listConfirmedReservationsForDates(weekDateIsos);
  const now = new Date();

  const days = weekDates.map((date) => {
    const dateIso = formatIsoDate(date);
    const dayReservations = weekReservations.filter((r) => r.date === dateIso);

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
  gender: Gender;
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
  const therapists = await listTherapists();
  const weekReservations = await listConfirmedReservationsForDates(weekDates);

  const requestedEnd = startMinutes + durationMinutes + CLEANUP_BUFFER_MINUTES;
  const dayReservations = weekReservations.filter((r) => r.date === date);
  const overlapping = dayReservations.filter((r) => {
    const { start, end } = occupiedRange(r);
    return rangesOverlap(start, end, startMinutes, requestedEnd);
  });

  const busyTherapistIds = new Set(overlapping.map((r) => r.therapistId));
  // Two therapists can share a fixed room, so one being busy makes the room (and thus
  // the other therapist assigned to it) unavailable too, even with no direct conflict.
  const busyRoomIds = new Set(overlapping.map((r) => r.roomId).filter((id): id is string => id !== null));

  const options: TherapistOption[] = therapists.map((t) => {
    const reservationCountInWeek = weekReservations.filter((r) => r.therapistId === t.id).length;
    return {
      id: t.id,
      name: t.name,
      gender: t.gender,
      specialty: t.specialty,
      isAvailable: !busyTherapistIds.has(t.id) && !(t.roomId !== null && busyRoomIds.has(t.roomId)),
      occupancyRate: computeOccupancyRate({
        reservationCountInWeek,
        businessDaysPerWeek: BUSINESS_DAYS.length,
        hoursPerDay,
      }),
      isAutoRecommended: false,
    };
  });

  const candidates: TherapistCandidate[] = options.map((o) => ({
    id: o.id,
    gender: o.gender,
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
  const userId = await getUserIdByEmployeeCode(session.employeeId);

  if (isSlotInPast(input.date, input.startMinutes, new Date())) {
    return { ok: false, error: "過去の日時は予約できません。" };
  }

  if (input.startMinutes + input.durationMinutes > CLOSING_TIME_MINUTES) {
    return { ok: false, error: "この時間帯は営業終了までに施術が終わらないため予約できません。" };
  }

  const requestedWeekIsos = getWeekDates(new Date(`${input.date}T00:00:00`)).map(formatIsoDate);
  const weekReservations = await listConfirmedReservationsForDates(requestedWeekIsos);
  const alreadyBookedThisWeek = weekReservations.some((r) => r.userId === userId);
  if (alreadyBookedThisWeek) {
    return { ok: false, error: "1週間に1回までしか予約できません。" };
  }

  const therapists = await listTherapists();
  const therapist = therapists.find((t) => t.id === input.therapistId);
  if (!therapist) {
    return { ok: false, error: "指定された施術者が見つかりません。" };
  }

  const requestedEnd = input.startMinutes + input.durationMinutes + CLEANUP_BUFFER_MINUTES;
  const dayReservations = weekReservations.filter((r) => r.date === input.date);
  const overlapping = dayReservations.filter((r) => {
    const { start, end } = occupiedRange(r);
    return rangesOverlap(start, end, input.startMinutes, requestedEnd);
  });

  const therapistAlreadyBooked = overlapping.some((r) => r.therapistId === therapist.id);
  const roomAlreadyBooked = therapist.roomId !== null && overlapping.some((r) => r.roomId === therapist.roomId);
  if (therapistAlreadyBooked || roomAlreadyBooked) {
    return { ok: false, error: "この枠は埋まりました。別の枠を選んでください。" };
  }

  let reservationId: string;
  try {
    reservationId = await insertReservation({
      userId,
      therapistId: therapist.id,
      roomId: therapist.roomId,
      date: input.date,
      startMinutes: input.startMinutes,
      durationMinutes: input.durationMinutes,
      note: input.note ?? "",
    });
  } catch {
    // Defense in depth against a race condition the DB's own EXCLUDE constraints catch.
    return { ok: false, error: "この枠は埋まりました。別の枠を選んでください。" };
  }

  sendSlackMessage(
    `📅 予約が入りました：${session.name} さん ${input.date} ${formatTimeLabel(input.startMinutes)}〜` +
      `（${therapist.name}・${input.durationMinutes}分）`
  );

  return { ok: true, reservationId };
}

export async function cancelReservation(
  reservationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireRole("user");
  const userId = await getUserIdByEmployeeCode(session.employeeId);

  const reservation = await getReservationById(reservationId);
  if (!reservation) {
    return { ok: false, error: "予約が見つかりません。" };
  }
  if (reservation.userId !== userId) {
    return { ok: false, error: "この予約をキャンセルする権限がありません。" };
  }

  await cancelReservationById(reservationId);

  sendSlackMessage(
    `🗑️ 予約がキャンセルされました：${session.name} さん ${reservation.date} ${formatTimeLabel(reservation.startMinutes)}〜`
  );

  return { ok: true };
}

/** Finds the current user's reservation covering a given slot, if any — used to open the cancel dialog. */
export async function getOwnReservationAt(
  date: string,
  startMinutes: number
): Promise<{ id: string } | null> {
  const session = await requireRole("user");
  const userId = await getUserIdByEmployeeCode(session.employeeId);
  const dayReservations = await listConfirmedReservationsForDates([date]);
  const match = dayReservations.find((r) => r.userId === userId && reservationCoversTick(r, startMinutes));
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
  const userId = await getUserIdByEmployeeCode(session.employeeId);
  const all = await listConfirmedReservationsForUser(userId);
  const now = new Date();

  return all
    .filter((r) => !isSlotInPast(r.date, r.startMinutes, now))
    .sort((a, b) => (a.date === b.date ? a.startMinutes - b.startMinutes : a.date < b.date ? -1 : 1))
    .slice(0, limit)
    .map(({ id, date, startMinutes, durationMinutes, note }) => ({ id, date, startMinutes, durationMinutes, note }));
}

export type MyReview = { rating: number; comment: string };

export type HistoryEntry = MyReservation & {
  therapistName: string;
  therapistSpecialty: string;
  review: MyReview | null;
};

/** The current user's past reservations, most recent first, for the mypage treatment history. */
export async function getMyReservationHistory(limit = 5): Promise<HistoryEntry[]> {
  const session = await requireRole("user");
  const userId = await getUserIdByEmployeeCode(session.employeeId);
  const all = await listConfirmedReservationsForUser(userId);
  const now = new Date();

  const past = all
    .filter((r) => isSlotInPast(r.date, r.startMinutes, now))
    .sort((a, b) => (a.date === b.date ? b.startMinutes - a.startMinutes : a.date < b.date ? 1 : -1))
    .slice(0, limit);

  const therapists = await listTherapists();
  const reviewsById = await getReviewsForReservations(past.map((r) => r.id));

  return past.map((r) => {
    const therapist = therapists.find((t) => t.id === r.therapistId);
    const review = reviewsById.get(r.id);
    return {
      id: r.id,
      date: r.date,
      startMinutes: r.startMinutes,
      durationMinutes: r.durationMinutes,
      note: r.note,
      therapistName: therapist?.name ?? "不明",
      therapistSpecialty: therapist?.specialty ?? "",
      review: review ? { rating: review.rating, comment: review.comment ?? "" } : null,
    };
  });
}

/**
 * Submits a 1-5 star review (comment optional) for a past reservation of the current
 * user's. One review per reservation, matching db/schema.sql's UNIQUE reservation_id —
 * anonymous by design, so no reviewer identity is stored alongside the review itself.
 */
export async function submitReview(
  reservationId: string,
  rating: number,
  comment: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireRole("user");
  const userId = await getUserIdByEmployeeCode(session.employeeId);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "評価は1〜5の範囲で選択してください。" };
  }

  const reservation = await getReservationById(reservationId);
  if (!reservation) {
    return { ok: false, error: "予約が見つかりません。" };
  }
  if (reservation.userId !== userId) {
    return { ok: false, error: "この予約にレビューを投稿する権限がありません。" };
  }
  if (!isSlotInPast(reservation.date, reservation.startMinutes, new Date())) {
    return { ok: false, error: "施術が完了してからレビューを投稿できます。" };
  }
  if (await getReviewForReservation(reservationId)) {
    return { ok: false, error: "この予約にはすでにレビューが投稿されています。" };
  }

  try {
    await insertReview(reservationId, rating, comment);
  } catch {
    return { ok: false, error: "この予約にはすでにレビューが投稿されています。" };
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
  const totalRooms = await countRooms();
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

  const dateIsos = candidateDates.map(formatIsoDate);
  const allReservations = await listConfirmedReservationsForDates(dateIsos);

  const open: OpenSlot[] = [];
  for (const dateIso of dateIsos) {
    if (open.length >= limit) break;
    const dayReservations = allReservations.filter((r) => r.date === dateIso);

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
