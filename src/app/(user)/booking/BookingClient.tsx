"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { DateStrip } from "@/components/booking/DateStrip";
import { AvailabilityGrid } from "@/components/booking/AvailabilityGrid";
import { TherapistPanel } from "@/components/booking/TherapistPanel";
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

export function BookingClient() {
  const today = useMemo(() => new Date(), []);
  const [weekAnchor, setWeekAnchor] = useState(today);
  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);

  const [selectedDate, setSelectedDate] = useState(formatIsoDate(today));
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [days, setDays] = useState<AvailabilityDay[]>([]);

  const [genderFilter, setGenderFilter] = useState<Gender[]>([]);
  const [candidates, setCandidates] = useState<TherapistOption[]>([]);
  const [selectedTherapistId, setSelectedTherapistId] = useState<string | null>(null);
  const [manuallyPicked, setManuallyPicked] = useState(false);

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
    getTherapistCandidates(selectedDate, selectedHour, genderFilter).then((options) => {
      setCandidates(options);
      if (!manuallyPicked) {
        setSelectedTherapistId(options.find((o) => o.isAutoRecommended)?.id ?? null);
      }
    });
  }, [selectedDate, selectedHour, genderFilter, manuallyPicked]);

  function handleSelectSlot(date: string, hour: number) {
    setSelectedDate(date);
    setSelectedHour(hour);
    setManuallyPicked(false);
    setError(null);
    setSuccess(false);
  }

  function handleSelectDate(iso: string) {
    setSelectedDate(iso);
    setError(null);
    setSuccess(false);
  }

  function handleToggleGenderFilter(gender: Gender) {
    setGenderFilter((prev) => (prev.includes(gender) ? prev.filter((g) => g !== gender) : [...prev, gender]));
  }

  function handleSelectTherapist(id: string) {
    setSelectedTherapistId(id);
    setManuallyPicked(true);
  }

  function handleConfirm() {
    if (selectedHour === null || !selectedTherapistId) return;
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await createReservation({
        date: selectedDate,
        startHour: selectedHour,
        durationMinutes,
        therapistId: selectedTherapistId,
        note: note || undefined,
        autoAssigned: !manuallyPicked,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setSelectedHour(null);
      setCandidates([]);
      setSelectedTherapistId(null);
      setManuallyPicked(false);
      setNote("");
      getAvailability(formatIsoDate(weekDates[0])).then(setDays);
    });
  }

  const confirmLabel = selectedHour !== null ? `${selectedDate.slice(5).replace("-", "/")} ${selectedHour}:00〜` : "";

  return (
    <div className="flex flex-col gap-6 p-5 sm:p-8">
      <DateStrip
        weekDates={weekDates}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        onPrevWeek={() => setWeekAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))}
        onNextWeek={() => setWeekAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))}
      />
      <AvailabilityGrid
        days={days}
        selectedDate={selectedDate}
        selectedHour={selectedHour}
        onSelectSlot={handleSelectSlot}
      />
      <TherapistPanel
        candidates={candidates}
        genderFilter={genderFilter}
        onToggleGenderFilter={handleToggleGenderFilter}
        selectedTherapistId={selectedTherapistId}
        onSelectTherapist={handleSelectTherapist}
      />
      <DurationControl durationMinutes={durationMinutes} onChange={setDurationMinutes} />
      <NoteField note={note} onChange={setNote} />
      <ConfirmBar
        label={confirmLabel}
        disabled={selectedHour === null || !selectedTherapistId}
        pending={isPending}
        error={error}
        success={success}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
