import { requireRole } from "@/lib/dal";
import { findTherapistProfileIdByEmployeeCode } from "@/lib/employees";
import { getDaySchedule } from "@/lib/shifts";
import { currentSlotIndex } from "@/lib/shift-slots";
import { getReservationsForTherapist } from "@/lib/reservations";
import { getNotificationSettings } from "@/lib/notifications";
import { localDateIso, localTimeHHMM, parseIsoDateLocal, addLocalDays, isValidDateIso, localWeekday } from "@/lib/local-date";
import { ScheduleView } from "./schedule-view";

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金"];

function mondayOf(date: Date): Date {
  const day = localWeekday(date); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addLocalDays(date, diffToMonday);
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await requireRole("therapist");
  const therapistProfileId = findTherapistProfileIdByEmployeeCode(session.employeeId);

  const { week } = await searchParams;
  // `new Date("YYYY-MM-DD")` parses as *UTC* midnight, which reads as the
  // wrong local calendar day west of UTC — parseIsoDateLocal treats it as a
  // plain calendar date instead, matching the `new Date()` ("now") branch.
  const requestedMonday = week && isValidDateIso(week) ? parseIsoDateLocal(week) : new Date();
  const monday = mondayOf(requestedMonday);

  const now = new Date();
  const todayIso = localDateIso(now);
  const nowTime = localTimeHHMM(now);

  const days = Array.from({ length: 5 }, (_, i) => {
    const date = addLocalDays(monday, i);
    const dateIso = localDateIso(date);
    const schedule = therapistProfileId ? getDaySchedule(therapistProfileId, dateIso) : { slots: [], labels: [] };
    return {
      dateIso,
      label: `${WEEKDAY_LABELS[i]} ${date.getMonth() + 1}/${date.getDate()}`,
      slots: schedule.slots,
      labels: schedule.labels,
      events: therapistProfileId ? getReservationsForTherapist(therapistProfileId, dateIso) : [],
      isPast: dateIso < todayIso,
      isToday: dateIso === todayIso,
      lockedUpTo: dateIso === todayIso ? currentSlotIndex(now) : 0,
    };
  });

  const weekLabel = `${monday.getFullYear()}年${monday.getMonth() + 1}月${monday.getDate()}日の週`;
  const prevWeekIso = localDateIso(addLocalDays(monday, -7));
  const nextWeekIso = localDateIso(addLocalDays(monday, 7));
  const currentWeekMondayIso = localDateIso(mondayOf(now));
  const notification = getNotificationSettings(session.employeeId, "slack");

  return (
    <ScheduleView
      key={days[0].dateIso}
      name={session.name}
      days={days}
      weekLabel={weekLabel}
      prevWeekIso={prevWeekIso}
      nextWeekIso={nextWeekIso}
      currentWeekMondayIso={currentWeekMondayIso}
      notification={notification}
      nowTime={nowTime}
    />
  );
}
