"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateStrip } from "@/components/booking/DateStrip";
import { AvailabilityGrid } from "@/components/booking/AvailabilityGrid";
import { TherapistPanel, type TherapistMode } from "@/components/booking/TherapistPanel";
import { DurationControl } from "@/components/booking/DurationControl";
import { NoteField } from "@/components/booking/NoteField";
import { ConfirmBar } from "@/components/booking/ConfirmBar";
import { ConfirmDialog } from "@/components/booking/ConfirmDialog";
import { CancelDialog } from "@/components/booking/CancelDialog";
import {
  getWeekDates,
  formatIsoDate,
  formatTimeLabel,
  formatDateWithWeekday,
  isSlotInPast,
} from "@/lib/booking/schedule";
import {
  getAvailability,
  getTherapistCandidates,
  createReservation,
  cancelReservation,
  getOwnReservationAt,
  type AvailabilityDay,
  type TherapistOption,
} from "@/lib/booking/actions";
import type { Gender } from "@/lib/booking/repo";

function genderFilterForMode(mode: TherapistMode): Gender[] {
  if (mode === "male") return ["male"];
  if (mode === "female") return ["female"];
  return [];
}

export function BookingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDateParam = searchParams.get("date");
  const initialStartMinutesParam = searchParams.get("startMinutes");

  const today = useMemo(() => new Date(), []);
  const initialAnchor = useMemo(
    () => (initialDateParam ? new Date(`${initialDateParam}T00:00:00`) : today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const currentWeekMonday = useMemo(() => getWeekDates(today)[0], [today]);
  const [weekAnchor, setWeekAnchor] = useState(initialAnchor);
  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);
  const canGoPrevWeek = weekDates[0] > currentWeekMonday;

  const [selectedDate, setSelectedDate] = useState(initialDateParam ?? formatIsoDate(today));
  const [selectedStartMinutes, setSelectedStartMinutes] = useState<number | null>(null);
  const autoCancelTriedRef = useRef(false);
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

  // A duration change can push the currently selected start time past closing time
  // (e.g. 19:15 fits a 20-min treatment but not a 45-min one) — deselect it when that happens.
  useEffect(() => {
    if (selectedStartMinutes === null) return;
    const day = days.find((d) => d.date === selectedDate);
    const slot = day?.slots.find((s) => s.startMinutes === selectedStartMinutes);
    if (!slot || slot.status === "unavailable" || slot.status === "tooLate") {
      const timer = setTimeout(() => setSelectedStartMinutes(null), 0);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

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
    const isDesktop = window.matchMedia("(min-width: 640px)").matches;
    window.scrollTo({
      top: isDesktop ? 0 : document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  }

  // Arriving from mypage's "予約をキャンセル" link (?date=...&startMinutes=...): once that
  // date's availability has loaded, open the same cancel dialog a manual slot-click would.
  useEffect(() => {
    if (autoCancelTriedRef.current || !initialStartMinutesParam || !initialDateParam) return;
    const day = days.find((d) => d.date === initialDateParam);
    if (!day) return;
    autoCancelTriedRef.current = true;
    const startMinutes = Number(initialStartMinutesParam);
    const timer = setTimeout(() => handleSelectSlot(initialDateParam, startMinutes), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

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
      try {
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
      } catch {
        // A dropped/errored request should never leave the dialog stuck on "予約しています…".
        setConfirmError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  function handleCloseConfirm() {
    setConfirmOpen(false);
    if (confirmStep === "success") {
      router.push("/mypage");
    }
  }

  function handleConfirmCancel() {
    if (!cancelTarget) return;
    setCancelError(null);
    startCancelTransition(async () => {
      try {
        const result = await cancelReservation(cancelTarget.reservationId);
        if (!result.ok) {
          setCancelError(result.error);
          return;
        }
        setCancelStep("success");
        refreshAvailability();
      } catch {
        setCancelError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  const confirmTimeLabel = selectedStartMinutes !== null ? `${formatTimeLabel(selectedStartMinutes)}〜` : "";
  // The Monday after whichever week is currently blocked — not always "today's week + 7",
  // since the blocked week being viewed may already be a future one.
  const nextAvailableDate = new Date(weekDates[0]);
  nextAvailableDate.setDate(nextAvailableDate.getDate() + 7);
  const nextAvailableDateLabel = formatDateWithWeekday(formatIsoDate(nextAvailableDate));

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
          <DurationControl durationMinutes={durationMinutes} onChange={setDurationMinutes} slotSelected={selectedStartMinutes !== null} />
        </div>
        <AvailabilityGrid
          days={days}
          selectedDate={selectedDate}
          selectedStartMinutes={selectedStartMinutes}
          durationMinutes={durationMinutes}
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
        {selectedStartMinutes !== null && (
          <div className="rounded-xl border border-accent bg-accent-soft p-3">
            <p className="mb-1 text-xs text-ink-faint">選択中の日時</p>
            <p className="mono text-base font-bold text-accent-strong">
              {formatDateWithWeekday(selectedDate)} {confirmTimeLabel}
            </p>
            <p className="mono mt-1 text-xs text-ink-faint">施術時間 {durationMinutes}分</p>
          </div>
        )}
        <div className="hidden sm:block">
          <DurationControl durationMinutes={durationMinutes} onChange={setDurationMinutes} slotSelected={selectedStartMinutes !== null} />
        </div>
        <NoteField note={note} onChange={setNote} />
        {userHasReservationThisWeek && (
          <p className="text-xs text-destructive">
            1週間に1回までしか予約できません。次回は{nextAvailableDateLabel}から予約できます。
          </p>
        )}
        <ConfirmBar
          disabled={selectedStartMinutes === null || !assignedTherapistId || userHasReservationThisWeek}
          onOpen={handleOpenConfirm}
        />
      </div>

      {confirmOpen && (
        <ConfirmDialog
          step={confirmStep}
          dateLabel={formatDateWithWeekday(selectedDate)}
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
          dateLabel={formatDateWithWeekday(cancelTarget.date)}
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
