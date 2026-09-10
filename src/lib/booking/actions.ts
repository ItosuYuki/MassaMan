"use server";

import { requireRole } from "@/lib/dal";
import {
  getWeekDates,
  getHourSlots,
  formatIsoDate,
  isSlotInPast,
  BUSINESS_DAYS,
  BUSINESS_HOURS,
} from "./schedule";
import { computeSlotStatus, type SlotStatus } from "./availability";
import { computeOccupancyRate } from "./occupancy";
import { autoAssignTherapist, type TherapistCandidate } from "./auto-assign";
import { getStore, nextReservationId, ROOMS, THERAPISTS, type Gender } from "./mock-data";

export type AvailabilityDay = {
  date: string;
  slots: { hour: number; status: SlotStatus }[];
};

export type AvailabilityResult = {
  days: AvailabilityDay[];
  /** Users may only hold one confirmed reservation per business week. */
  userHasReservationThisWeek: boolean;
};

export async function getAvailability(weekStartIso: string): Promise<AvailabilityResult> {
  const session = await requireRole("user");
  const anchor = new Date(`${weekStartIso}T00:00:00`);
  const weekDates = getWeekDates(anchor);
  const weekDateIsos = weekDates.map(formatIsoDate);
  const hourSlots = getHourSlots();
  const totalRooms = ROOMS.length;
  const { reservations } = getStore();
  const now = new Date();

  const days = weekDates.map((date) => {
    const dateIso = formatIsoDate(date);
    const dayReservations = reservations.filter((r) => r.date === dateIso);

    const slots = hourSlots.map((hour) => {
      const atHour = dayReservations.filter((r) => r.startHour === hour);
      const status = computeSlotStatus({
        totalRooms,
        bookedRoomCount: atHour.length,
        isOwnReservation: atHour.some((r) => r.userEmployeeId === session.employeeId),
        isPast: isSlotInPast(dateIso, hour, now),
      });
      return { hour, status };
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
  startHour: number,
  genderFilter: Gender[]
): Promise<TherapistOption[]> {
  await requireRole("user");
  const targetAnchor = new Date(`${date}T00:00:00`);
  const weekDates = getWeekDates(targetAnchor).map(formatIsoDate);
  const hoursPerDay = BUSINESS_HOURS.end - BUSINESS_HOURS.start + 1;
  const { reservations } = getStore();

  const bookedThisSlotTherapistIds = new Set(
    reservations.filter((r) => r.date === date && r.startHour === startHour).map((r) => r.therapistId)
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
      isAvailable: !bookedThisSlotTherapistIds.has(t.id),
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
  startHour: number;
  durationMinutes: number;
  therapistId: string;
  note?: string;
  autoAssigned: boolean;
}): Promise<{ ok: true; reservationId: string } | { ok: false; error: string }> {
  const session = await requireRole("user");
  const store = getStore();

  if (isSlotInPast(input.date, input.startHour, new Date())) {
    return { ok: false, error: "過去の日時は予約できません。" };
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

  const reservationsAtSlot = store.reservations.filter(
    (r) => r.date === input.date && r.startHour === input.startHour
  );

  const therapistAlreadyBooked = reservationsAtSlot.some((r) => r.therapistId === therapist.id);
  if (therapistAlreadyBooked) {
    return { ok: false, error: "この枠は埋まりました。別の枠を選んでください。" };
  }

  const bookedRoomIds = new Set(reservationsAtSlot.map((r) => r.roomId));
  const freeRoom = ROOMS.find((room) => !bookedRoomIds.has(room.id));
  if (!freeRoom) {
    return { ok: false, error: "この枠は埋まりました。別の枠を選んでください。" };
  }

  const reservation = {
    id: nextReservationId(),
    userEmployeeId: session.employeeId,
    userName: session.name,
    therapistId: therapist.id,
    roomId: freeRoom.id,
    date: input.date,
    startHour: input.startHour,
    durationMinutes: input.durationMinutes,
    note: input.note ?? "",
    autoAssigned: input.autoAssigned,
    createdAt: Date.now(),
  };
  store.reservations.push(reservation);

  return { ok: true, reservationId: reservation.id };
}
