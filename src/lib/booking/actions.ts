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
import { getStore, nextReservationId, ROOMS, THERAPISTS, type Gender, type Reservation } from "./mock-data";
import { sendSlackMessage } from "@/lib/notifications/slack";

/** Post-treatment cleanup buffer: nobody else may book this therapist/room for this long after. */
const CLEANUP_BUFFER_MINUTES = 15;

function occupiedRange(r: Pick<Reservation, "startMinutes" | "durationMinutes">) {
  return { start: r.startMinutes, end: r.startMinutes + r.durationMinutes + CLEANUP_BUFFER_MINUTES };
}

/** Whether a reservation's occupied range (treatment + cleanup buffer) overlaps a 15-min tick. */
function reservationCoversTick(r: Pick<Reservation, "startMinutes" | "durationMinutes">, tick: number): boolean {
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
  const anchor = new Date(`${weekStartIso}T00:00:00`);
  const weekDates = getWeekDates(anchor);
  const weekDateIsos = weekDates.map(formatIsoDate);
  const timeSlots = getTimeSlots();
  const totalRooms = ROOMS.length;
  const { reservations } = getStore();
  const now = new Date();

  const days = weekDates.map((date) => {
    const dateIso = formatIsoDate(date);
    const dayReservations = reservations.filter((r) => r.date === dateIso);

    const slots = timeSlots.map((tick) => {
      const coveringTick = dayReservations.filter((r) => reservationCoversTick(r, tick));
      const bookedRoomCount = new Set(coveringTick.map((r) => r.roomId)).size;
      const status = computeSlotStatus({
        totalRooms,
        bookedRoomCount,
        isOwnReservation: coveringTick.some((r) => r.userEmployeeId === session.employeeId),
        isPast: isSlotInPast(dateIso, tick, now),
        // Treatment itself (not the cleanup buffer after it) must finish by closing.
        wouldExceedClosing: tick + durationMinutes > CLOSING_TIME_MINUTES,
      });
      return { startMinutes: tick, status };
    });

    return { date: dateIso, slots };
  });

  const userHasReservationThisWeek = reservations.some(
    (r) => r.userEmployeeId === session.employeeId && weekDateIsos.includes(r.date)
  );

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
  const { reservations } = getStore();

  const requestedEnd = startMinutes + durationMinutes + CLEANUP_BUFFER_MINUTES;
  const dayReservations = reservations.filter((r) => r.date === date);

  const busyTherapistIds = new Set(
    dayReservations
      .filter((r) => {
        const { start, end } = occupiedRange(r);
        return rangesOverlap(start, end, startMinutes, requestedEnd);
      })
      .map((r) => r.therapistId)
  );

  const options: TherapistOption[] = THERAPISTS.map((t) => {
    const reservationCountInWeek = reservations.filter(
      (r) => r.therapistId === t.id && weekDates.includes(r.date)
    ).length;
    return {
      id: t.id,
      name: t.name,
      gender: t.gender,
      specialty: t.specialty,
      isAvailable: !busyTherapistIds.has(t.id),
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
  const store = getStore();

  if (isSlotInPast(input.date, input.startMinutes, new Date())) {
    return { ok: false, error: "過去の日時は予約できません。" };
  }

  if (input.startMinutes + input.durationMinutes > CLOSING_TIME_MINUTES) {
    return { ok: false, error: "この時間帯は営業終了までに施術が終わらないため予約できません。" };
  }

  const requestedWeekIsos = getWeekDates(new Date(`${input.date}T00:00:00`)).map(formatIsoDate);
  const alreadyBookedThisWeek = store.reservations.some(
    (r) => r.userEmployeeId === session.employeeId && requestedWeekIsos.includes(r.date)
  );
  if (alreadyBookedThisWeek) {
    return { ok: false, error: "1週間に1回までしか予約できません。" };
  }

  const therapist = THERAPISTS.find((t) => t.id === input.therapistId);
  if (!therapist) {
    return { ok: false, error: "指定された施術者が見つかりません。" };
  }

  const requestedEnd = input.startMinutes + input.durationMinutes + CLEANUP_BUFFER_MINUTES;
  const dayReservations = store.reservations.filter((r) => r.date === input.date);
  const overlapping = dayReservations.filter((r) => {
    const { start, end } = occupiedRange(r);
    return rangesOverlap(start, end, input.startMinutes, requestedEnd);
  });

  const therapistAlreadyBooked = overlapping.some((r) => r.therapistId === therapist.id);
  if (therapistAlreadyBooked) {
    return { ok: false, error: "この枠は埋まりました。別の枠を選んでください。" };
  }

  const bookedRoomIds = new Set(overlapping.map((r) => r.roomId));
  const freeRoom = ROOMS.find((room) => !bookedRoomIds.has(room.id));
  if (!freeRoom) {
    return { ok: false, error: "この枠は埋まりました。別の枠を選んでください。" };
  }

  const reservation: Reservation = {
    id: nextReservationId(),
    userEmployeeId: session.employeeId,
    userName: session.name,
    therapistId: therapist.id,
    roomId: freeRoom.id,
    date: input.date,
    startMinutes: input.startMinutes,
    durationMinutes: input.durationMinutes,
    note: input.note ?? "",
    autoAssigned: input.autoAssigned,
    createdAt: Date.now(),
  };
  store.reservations.push(reservation);

  sendSlackMessage(
    `📅 予約が入りました：${session.name} さん ${input.date} ${formatTimeLabel(input.startMinutes)}〜` +
      `（${therapist.name}・${input.durationMinutes}分）`
  );

  return { ok: true, reservationId: reservation.id };
}

export async function cancelReservation(
  reservationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireRole("user");
  const store = getStore();

  const index = store.reservations.findIndex((r) => r.id === reservationId);
  if (index === -1) {
    return { ok: false, error: "予約が見つかりません。" };
  }
  const cancelled = store.reservations[index];
  if (cancelled.userEmployeeId !== session.employeeId) {
    return { ok: false, error: "この予約をキャンセルする権限がありません。" };
  }

  store.reservations.splice(index, 1);

  sendSlackMessage(
    `🗑️ 予約がキャンセルされました：${session.name} さん ${cancelled.date} ${formatTimeLabel(cancelled.startMinutes)}〜`
  );

  return { ok: true };
}

/** Finds the current user's reservation covering a given slot, if any — used to open the cancel dialog. */
export async function getOwnReservationAt(
  date: string,
  startMinutes: number
): Promise<{ id: string } | null> {
  const session = await requireRole("user");
  const { reservations } = getStore();
  const match = reservations.find(
    (r) => r.date === date && r.userEmployeeId === session.employeeId && reservationCoversTick(r, startMinutes)
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
  const { reservations } = getStore();
  const now = new Date();

  return reservations
    .filter((r) => r.userEmployeeId === session.employeeId && !isSlotInPast(r.date, r.startMinutes, now))
    .sort((a, b) => (a.date === b.date ? a.startMinutes - b.startMinutes : a.date < b.date ? -1 : 1))
    .slice(0, limit)
    .map(({ id, date, startMinutes, durationMinutes, note }) => ({ id, date, startMinutes, durationMinutes, note }));
}

/** The current user's past reservations, most recent first, for the mypage treatment history. */
export async function getMyReservationHistory(limit = 5): Promise<MyReservation[]> {
  const session = await requireRole("user");
  const { reservations } = getStore();
  const now = new Date();

  return reservations
    .filter((r) => r.userEmployeeId === session.employeeId && isSlotInPast(r.date, r.startMinutes, now))
    .sort((a, b) => (a.date === b.date ? b.startMinutes - a.startMinutes : a.date < b.date ? 1 : -1))
    .slice(0, limit)
    .map(({ id, date, startMinutes, durationMinutes, note }) => ({ id, date, startMinutes, durationMinutes, note }));
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
  const totalRooms = ROOMS.length;
  const { reservations } = getStore();
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

  const open: OpenSlot[] = [];
  for (const date of candidateDates) {
    if (open.length >= limit) break;
    const dateIso = formatIsoDate(date);
    const dayReservations = reservations.filter((r) => r.date === dateIso);

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
