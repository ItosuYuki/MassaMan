import { requireRole } from "@/lib/dal";
import { findTherapistProfileIdByEmployeeCode } from "@/lib/employees";
import { getReservationsForTherapist } from "@/lib/reservations";
import { getNotificationSettings } from "@/lib/notifications";
import { BookingsView } from "./bookings-view";

function toDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toDayLabel(date: Date, prefix?: string): string {
  const md = `${date.getMonth() + 1}/${date.getDate()}`;
  return prefix ? `${prefix} ${md}` : md;
}

export default async function BookingsPage() {
  const session = await requireRole("therapist");
  const therapistProfileId = findTherapistProfileIdByEmployeeCode(session.employeeId);

  const today = new Date();
  const dayDefs = [0, 1, 2].map((offset) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    return {
      key: offset === 0 ? "today" : offset === 1 ? "tomorrow" : "day-after",
      label: toDayLabel(date, offset === 0 ? "今日" : offset === 1 ? "明日" : undefined),
      countLabel: offset === 0 ? "本日" : offset === 1 ? "明日" : toDayLabel(date),
      dateIso: toDateIso(date),
    };
  });

  const days = dayDefs.map((day) => ({
    ...day,
    events: therapistProfileId ? getReservationsForTherapist(therapistProfileId, day.dateIso) : [],
  }));

  const notification = getNotificationSettings(session.employeeId, "slack");

  return <BookingsView name={session.name} days={days} notification={notification} />;
}
