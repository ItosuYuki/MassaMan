import { requireRole } from "@/lib/dal";
import { findTherapistProfileIdByEmployeeCode } from "@/lib/employees";
import { getDayAvailability } from "@/lib/shifts";
import { currentSlotIndex } from "@/lib/shift-slots";
import { getReservationsForTherapist } from "@/lib/reservations";
import { getNotificationSettings } from "@/lib/notifications";
import { ScheduleView } from "./schedule-view";

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金"];
const DAY_MS = 24 * 60 * 60 * 1000;

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await requireRole("therapist");
  const therapistProfileId = findTherapistProfileIdByEmployeeCode(session.employeeId);

  const { week } = await searchParams;
  const requestedMonday = week && !Number.isNaN(Date.parse(week)) ? new Date(week) : new Date();
  const monday = mondayOf(requestedMonday);

  const now = new Date();
  const todayIso = toIso(now);
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const days = Array.from({ length: 5 }, (_, i) => {
    const date = new Date(monday.getTime() + i * DAY_MS);
    const dateIso = toIso(date);
    return {
      dateIso,
      label: `${WEEKDAY_LABELS[i]} ${date.getMonth() + 1}/${date.getDate()}`,
      slots: therapistProfileId ? getDayAvailability(therapistProfileId, dateIso) : [],
      events: therapistProfileId ? getReservationsForTherapist(therapistProfileId, dateIso) : [],
      isPast: dateIso < todayIso,
      isToday: dateIso === todayIso,
      lockedUpTo: dateIso === todayIso ? currentSlotIndex(now) : 0,
    };
  });

  const weekLabel = `${monday.getFullYear()}年${monday.getMonth() + 1}月${monday.getDate()}日の週`;
  const prevWeekIso = toIso(new Date(monday.getTime() - 7 * DAY_MS));
  const nextWeekIso = toIso(new Date(monday.getTime() + 7 * DAY_MS));
  const notification = getNotificationSettings(session.employeeId, "slack");

  return (
    <ScheduleView
      key={days[0].dateIso}
      name={session.name}
      days={days}
      weekLabel={weekLabel}
      prevWeekIso={prevWeekIso}
      nextWeekIso={nextWeekIso}
      notification={notification}
      nowTime={nowTime}
    />
  );
}
