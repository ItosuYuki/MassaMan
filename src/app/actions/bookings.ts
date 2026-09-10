"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { findTherapistProfileIdByEmployeeCode } from "@/lib/employees";
import {
  cancelReservationForTherapist,
  rescheduleReservationForTherapist,
  type CancelResult,
  type RescheduleResult,
} from "@/lib/reservations";
import { markRangeUnavailable } from "@/lib/shifts";
import { setNotificationEnabled } from "@/lib/notifications";

/**
 * Cancelling from this (therapist-facing) screen means the therapist can't do
 * the session — unlike a client cancelling, that slot isn't just "free again",
 * it's blocked for anyone else too. See markRangeUnavailable's own note.
 */
export async function cancelReservation(reservationId: string): Promise<CancelResult> {
  const session = await requireRole("therapist");
  const therapistProfileId = findTherapistProfileIdByEmployeeCode(session.employeeId);
  if (!therapistProfileId) return { status: "not_found" };

  const result = cancelReservationForTherapist(reservationId, therapistProfileId);
  if (result.status === "ok") {
    markRangeUnavailable(therapistProfileId, result.reservation.dateIso, result.reservation.startTime, result.reservation.endTime);
    revalidatePath("/schedule");
  }
  return result;
}

export async function rescheduleReservation(
  reservationId: string,
  newDateIso: string,
  newStartTime: string
): Promise<RescheduleResult> {
  const session = await requireRole("therapist");
  const therapistProfileId = findTherapistProfileIdByEmployeeCode(session.employeeId);
  if (!therapistProfileId) return { status: "not_found" };

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  // Rejects a past date outright, and rejects today's date paired with a time
  // that's already gone — the date-only check let a therapist "reschedule" a
  // future booking to, say, 08:00 today at 4pm and have it silently accepted.
  if (newDateIso < today || (newDateIso === today && newStartTime <= nowTime)) {
    return { status: "past" };
  }

  const result = rescheduleReservationForTherapist(reservationId, therapistProfileId, newDateIso, newStartTime);
  if (result.status === "ok") {
    revalidatePath("/schedule");
  }
  return result;
}

export async function setBookingNotificationEnabled(enabled: boolean) {
  const session = await requireRole("therapist");
  setNotificationEnabled(session.employeeId, "slack", enabled);
  revalidatePath("/schedule");
}
