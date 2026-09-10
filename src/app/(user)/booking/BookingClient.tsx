"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { DateStrip } from "@/components/booking/DateStrip";
import { AvailabilityGrid } from "@/components/booking/AvailabilityGrid";
import { TherapistPanel, type TherapistMode } from "@/components/booking/TherapistPanel";
import { DurationControl } from "@/components/booking/DurationControl";
import { NoteField } from "@/components/booking/NoteField";
import { ConfirmBar } from "@/components/booking/ConfirmBar";
import { ConfirmDialog } from "@/components/booking/ConfirmDialog";
import { CancelDialog } from "@/components/booking/CancelDialog";
import { DressCodeNotice } from "@/components/booking/DressCodeNotice";
import { getWeekDates, formatIsoDate, formatTimeLabel, isSlotInPast } from "@/lib/booking/schedule";
import {
  getAvailability,
  getTherapistCandidates,
  createReservation,
  cancelReservation,
  getOwnReservationAt,
  type AvailabilityDay,
  type TherapistOption,
} from "@/lib/booking/actions";
import type { Gender } from "@/lib/booking/mock-data";

function genderFilterForMode(mode: TherapistMode): Gender[] {
  if (mode === "male") return ["male"];
  if (mode === "female") return ["female"];
  return [];
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function dateLabel(iso: string): string {
  const weekday = WEEKDAY_LABELS[new Date(`${iso}T00:00:00`).getDay()];
  return `${iso.slice(5).replace("-", "/")}（${weekday}）`;
}

export function BookingClient() {
  const today = useMemo(() => new Date(), []);
  const currentWeekMonday = useMemo(() => getWeekDates(today)[0], [today]);
  const [weekAnchor, setWeekAnchor] = useState(today);
  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);
  const canGoPrevWeek = weekDates[0] > currentWeekMonday;

  const [selectedDate, setSelectedDate] = useState(formatIsoDate(today));
  const [selectedStartMinutes, setSelectedStartMinutes] = useState<number | null>(null);
  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [userHasReservationThisWeek, setUserHasReservationThisWeek] = useState(false);

  const [mode, setMode] = useState<TherapistMode>("auto");
  const [candidates, setCandidates] = useState<TherapistOption[]>([]);

  const [durationMinutes, setDurationMinutes] = useState(45);
  const [note, setNote] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState<"confirm" | "success">("confirm");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [cancelTarget, setCancelTarget] = useState<{
    reservationId: string;
    date: string;
    startMinutes: number;
  } | null>(null);
  const [cancelStep, setCancelStep] = useState<"confirm" | "success">("confirm");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelling, startCancelTransition] = useTransition();

  function refreshAvailability() {
    getAvailability(formatIsoDate(weekDates[0]), durationMinutes).then((result) => {
      setDays(result.days);
      setUserHasReservationThisWeek(result.userHasReservationThisWeek);
    });
  }

  useEffect(() => {
    refreshAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDates, durationMinutes]);

  useEffect(() => {
    if (selectedStartMinutes === null) {
      return;
    }
    getTherapistCandidates(selectedDate, selectedStartMinutes, durationMinutes, genderFilterForMode(mode)).then(
      setCandidates
    );
  }, [selectedDate, selectedStartMinutes, durationMinutes, mode]);

  const assignedTherapistId = candidates.find((c) => c.isAutoRecommended)?.id ?? null;
  const hasEligibleTherapist = candidates.some((c) => c.isAvailable);

  function handleSelectSlot(date: string, startMinutes: number) {
    if (isSlotInPast(date, startMinutes, new Date())) return;

    const day = days.find((d) => d.date === date);
    const slot = day?.slots.find((s) => s.startMinutes === startMinutes);
    if (slot?.status === "reserved") {
      getOwnReservationAt(date, startMinutes).then((res) => {
        if (res) {
          setCancelError(null);
          setCancelStep("confirm");
          setCancelTarget({ reservationId: res.id, date, startMinutes });
        }
      });
      return;
    }

    setSelectedDate(date);
    setSelectedStartMinutes(startMinutes);
  }

  function handleSelectDate(iso: string) {
    const picked = new Date(`${iso}T00:00:00`);
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    if (picked < todayMidnight) return;
    setSelectedDate(iso);
  }

  function handleOpenConfirm() {
    if (selectedStartMinutes === null || !assignedTherapistId) return;
    setConfirmError(null);
    setConfirmStep("confirm");
    setConfirmOpen(true);
  }

  function handleConfirmReservation() {
    if (selectedStartMinutes === null || !assignedTherapistId) return;
    setConfirmError(null);
    startTransition(async () => {
      const result = await createReservation({
        date: selectedDate,
        startMinutes: selectedStartMinutes,
        durationMinutes,
        therapistId: assignedTherapistId,
        note: note || undefined,
        autoAssigned: mode === "auto",
      });
      if (!result.ok) {
        setConfirmError(result.error);
        return;
      }
      setConfirmStep("success");
      setNote("");
      refreshAvailability();
    });
  }

  function handleCloseConfirm() {
    setConfirmOpen(false);
    if (confirmStep === "success") {
      setSelectedStartMinutes(null);
      setCandidates([]);
    }
  }

  function handleConfirmCancel() {
    if (!cancelTarget) return;
    setCancelError(null);
    startCancelTransition(async () => {
      const result = await cancelReservation(cancelTarget.reservationId);
      if (!result.ok) {
        setCancelError(result.error);
        return;
      }
      setCancelStep("success");
      refreshAvailability();
    });
  }

  const confirmTimeLabel = selectedStartMinutes !== null ? `${formatTimeLabel(selectedStartMinutes)}〜` : "";

  return (
    <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-start sm:gap-0 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-1">
        <div className="border-b border-border pb-6">
          <DateStrip
            weekDates={weekDates}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            onPrevWeek={() => setWeekAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))}
            onNextWeek={() => setWeekAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))}
            canGoPrevWeek={canGoPrevWeek}
          />
        </div>
        <div className="flex flex-col gap-6 border-b border-border pb-6 sm:hidden">
          <TherapistPanel
            mode={mode}
            onChangeMode={setMode}
            hasEligibleTherapist={hasEligibleTherapist}
            slotSelected={selectedStartMinutes !== null}
          />
          <DurationControl durationMinutes={durationMinutes} onChange={setDurationMinutes} />
        </div>
        <AvailabilityGrid
          days={days}
          selectedDate={selectedDate}
          selectedStartMinutes={selectedStartMinutes}
          onSelectSlot={handleSelectSlot}
        />
      </div>

      <div className="flex flex-col gap-6 sm:w-[340px] sm:flex-shrink-0 sm:border-l sm:border-border sm:pl-8">
        <div className="hidden sm:block">
          <TherapistPanel
            mode={mode}
            onChangeMode={setMode}
            hasEligibleTherapist={hasEligibleTherapist}
            slotSelected={selectedStartMinutes !== null}
          />
        </div>
        <div className="hidden sm:block">
          <DurationControl durationMinutes={durationMinutes} onChange={setDurationMinutes} />
        </div>
        <NoteField note={note} onChange={setNote} />
        <DressCodeNotice />
        {userHasReservationThisWeek && (
          <p className="text-xs text-destructive">1週間に1回までしか予約できません。今週はすでに予約があります。</p>
        )}
        <ConfirmBar
          label={confirmTimeLabel}
          disabled={selectedStartMinutes === null || !assignedTherapistId || userHasReservationThisWeek}
          onOpen={handleOpenConfirm}
        />
      </div>

      {confirmOpen && (
        <ConfirmDialog
          step={confirmStep}
          dateLabel={dateLabel(selectedDate)}
          timeLabel={confirmTimeLabel}
          durationMinutes={durationMinutes}
          note={note}
          pending={isPending}
          error={confirmError}
          onConfirm={handleConfirmReservation}
          onClose={handleCloseConfirm}
        />
      )}

      {cancelTarget && (
        <CancelDialog
          step={cancelStep}
          dateLabel={dateLabel(cancelTarget.date)}
          timeLabel={`${formatTimeLabel(cancelTarget.startMinutes)}〜`}
          pending={isCancelling}
          error={cancelError}
          onConfirm={handleConfirmCancel}
          onDismiss={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}
