"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { DateStrip } from "@/components/booking/DateStrip";
import { AvailabilityGrid } from "@/components/booking/AvailabilityGrid";
import { TherapistPanel, type TherapistMode } from "@/components/booking/TherapistPanel";
import { DurationControl } from "@/components/booking/DurationControl";
import { NoteField } from "@/components/booking/NoteField";
import { ConfirmBar } from "@/components/booking/ConfirmBar";
import { getWeekDates, formatIsoDate } from "@/lib/booking/schedule";
import {
  getAvailability,
  getTherapistCandidates,
  createReservation,
  type AvailabilityDay,
  type TherapistOption,
} from "@/lib/booking/actions";
import type { Gender } from "@/lib/booking/mock-data";

function genderFilterForMode(mode: TherapistMode): Gender[] {
  if (mode === "male") return ["male"];
  if (mode === "female") return ["female"];
  return [];
}

export function BookingClient() {
  const today = useMemo(() => new Date(), []);
  const [weekAnchor, setWeekAnchor] = useState(today);
  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);

  const [selectedDate, setSelectedDate] = useState(formatIsoDate(today));
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [days, setDays] = useState<AvailabilityDay[]>([]);

  const [mode, setMode] = useState<TherapistMode>("auto");
  const [candidates, setCandidates] = useState<TherapistOption[]>([]);

  const [durationMinutes, setDurationMinutes] = useState(45);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getAvailability(formatIsoDate(weekDates[0])).then(setDays);
  }, [weekDates]);

  useEffect(() => {
    if (selectedHour === null) {
      return;
    }
    getTherapistCandidates(selectedDate, selectedHour, genderFilterForMode(mode)).then(setCandidates);
  }, [selectedDate, selectedHour, mode]);

  const assignedTherapistId = candidates.find((c) => c.isAutoRecommended)?.id ?? null;
  const hasEligibleTherapist = candidates.some((c) => c.isAvailable);

  function handleSelectSlot(date: string, hour: number) {
    setSelectedDate(date);
    setSelectedHour(hour);
    setError(null);
    setSuccess(false);
  }

  function handleSelectDate(iso: string) {
    setSelectedDate(iso);
    setError(null);
    setSuccess(false);
  }

  function handleConfirm() {
    if (selectedHour === null || !assignedTherapistId) return;
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await createReservation({
        date: selectedDate,
        startHour: selectedHour,
        durationMinutes,
        therapistId: assignedTherapistId,
        note: note || undefined,
        autoAssigned: mode === "auto",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setSelectedHour(null);
      setCandidates([]);
      setNote("");
      getAvailability(formatIsoDate(weekDates[0])).then(setDays);
    });
  }

  const confirmLabel = selectedHour !== null ? `${selectedDate.slice(5).replace("-", "/")} ${selectedHour}:00〜` : "";

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
          />
        </div>
        <div className="sm:hidden">
          <TherapistPanel
            mode={mode}
            onChangeMode={setMode}
            hasEligibleTherapist={hasEligibleTherapist}
            slotSelected={selectedHour !== null}
          />
        </div>
        <AvailabilityGrid
          days={days}
          selectedDate={selectedDate}
          selectedHour={selectedHour}
          onSelectSlot={handleSelectSlot}
        />
      </div>

      <div className="flex flex-col gap-6 sm:w-[340px] sm:flex-shrink-0 sm:border-l sm:border-border sm:pl-8">
        <div className="hidden sm:block">
          <TherapistPanel
            mode={mode}
            onChangeMode={setMode}
            hasEligibleTherapist={hasEligibleTherapist}
            slotSelected={selectedHour !== null}
          />
        </div>
        <DurationControl durationMinutes={durationMinutes} onChange={setDurationMinutes} />
        <NoteField note={note} onChange={setNote} />
        <ConfirmBar
          label={confirmLabel}
          disabled={selectedHour === null || !assignedTherapistId}
          pending={isPending}
          error={error}
          success={success}
          onConfirm={handleConfirm}
        />
      </div>
    </div>
  );
}
