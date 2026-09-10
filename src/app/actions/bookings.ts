"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { findTherapistProfileIdByEmployeeCode } from "@/lib/employees";
import { cancelReservationForTherapist } from "@/lib/reservations";
import { setNotificationEnabled } from "@/lib/notifications";

export async function cancelReservation(reservationId: string) {
  const session = await requireRole("therapist");
  const therapistProfileId = findTherapistProfileIdByEmployeeCode(session.employeeId);
  if (!therapistProfileId) return;

  cancelReservationForTherapist(reservationId, therapistProfileId);
  revalidatePath("/bookings");
}

export async function setBookingNotificationEnabled(enabled: boolean) {
  const session = await requireRole("therapist");
  setNotificationEnabled(session.employeeId, "slack", enabled);
  revalidatePath("/bookings");
}
