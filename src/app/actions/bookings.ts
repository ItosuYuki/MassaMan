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

/**
 * Cancelling from this (therapist-facing) screen means the therapist can't do
 * the session — unlike a client cancelling, that slot isn't just "free again",
 * it's blocked for anyone else too. See markRangeUnavailable's own note.
 */
export async function cancelReservation(reservationId: string): Promise<CancelResult> {
  const session = await requireRole("therapist");
  const therapistProfileId = await findTherapistProfileIdByEmployeeCode(session.employeeId);
  if (!therapistProfileId) return { status: "not_found" };

  const result = await cancelReservationForTherapist(reservationId, therapistProfileId);
  if (result.status === "ok") {
    await markRangeUnavailable(therapistProfileId, result.reservation.dateIso, result.reservation.startTime, result.reservation.endTime);
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
  const therapistProfileId = await findTherapistProfileIdByEmployeeCode(session.employeeId);
  if (!therapistProfileId) return { status: "not_found" };

  // Date/time format, past-target, weekday, business-hours, and target-slot
  // availability are all validated inside rescheduleReservationForTherapist
  // itself — this action must stay safe even if called directly, so none of
  // that lives only here.
  const result = await rescheduleReservationForTherapist(reservationId, therapistProfileId, newDateIso, newStartTime);
  if (result.status === "ok") {
    revalidatePath("/schedule");
  }
  return result;
}
