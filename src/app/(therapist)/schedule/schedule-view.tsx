"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { logout } from "@/app/actions/auth";
import { saveWeekAvailability, copyWeekAvailability } from "@/app/actions/shifts";
import { cancelReservation, rescheduleReservation, setBookingNotificationEnabled } from "@/app/actions/bookings";
import { SLOT_COUNT, SLOTS_PER_HOUR, slotStartTime, type SlotState } from "@/lib/shift-slots";
import type { TherapistReservation } from "@/lib/reservations";
import type { NotificationSettings } from "@/lib/notifications";

type DayData = {
  dateIso: string;
  label: string;
  slots: SlotState[];
  events: TherapistReservation[];
  isPast: boolean;
  isToday: boolean;
  // For today only: slots before this index are already in the past (or in
  // progress) and can't be repainted. 0 for every other day.
  lockedUpTo: number;
};

// "available" is a pale BLUE tint so a confirmed reservation (bg-role-therapist,
// the stronger shade, plus a border — see the reservation chip below) stands
// out against it without needing a separate icon/symbol. "unavailable" is kept
// a plain neutral gray (not blue-tinted like surface-2) specifically so the two
// don't read as near-identical pale tiles.
const STATE_CLASSES: Record<SlotState, string> = {
  available: "bg-role-therapist-soft text-role-therapist",
  unavailable: "bg-ink-faint/35 text-ink-soft border-2 border-ink-faint/70",
  break: "bg-amber-soft text-amber",
};

const STATE_LABELS: Record<SlotState, string> = {
  available: "施術可能",
  unavailable: "不可",
  break: "休憩",
};

const TOOL_OPTIONS: { state: SlotState; label: string; swatchClass: string }[] = [
  { state: "available", label: "施術可能", swatchClass: "bg-role-therapist-soft" },
  { state: "unavailable", label: "不可", swatchClass: "bg-ink-faint/35 border-2 border-ink-faint/70" },
  { state: "break", label: "休憩", swatchClass: "bg-amber-soft" },
];

const CLIPBOARD_KEY = "massaman:schedule-clipboard-monday";
// Half of the old 44px hour row: slots are now 30min, but same-state slots
// still merge into one band (buildDayCells), so a full "available" morning
// still renders at the same height it always did — only an actual break/
// unavailable boundary now shows finer-grained.
const ROW_HEIGHT_PX = 22;
// Matches the grid container's `gap-1` (0.25rem = 4px). A cell spanning N rows
// renders as one continuous box of height N*ROW_HEIGHT_PX + (N-1)*ROW_GAP_PX —
// the row-gap "passes through" a multi-row item instead of leaving a visible
// seam — so anything positioning a mark *within* such a box (the hover divider
// lines, resolveSlotIndex's click math) has to use that same per-row pitch, or
// the marks drift further off with every row and the last segment ends up
// oversized.
const ROW_GAP_PX = 4;
const ROW_PITCH_PX = ROW_HEIGHT_PX + ROW_GAP_PX;

function formatMondayLabel(mondayIso: string): string {
  const [, month, day] = mondayIso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

// A reservation occupies a slot if their time ranges overlap at all — a slot
// [start, end) and a reservation [r.startTime, r.endTime) overlap when each
// starts before the other ends. With hourly slots this can return more than
// one reservation for a slot (the "up to 2 clients in one hour" overflow case
// — see the project_overflow_booking_rule memory).
function findEventsForSlot(events: TherapistReservation[], slotIndex: number): TherapistReservation[] {
  const slotStart = slotStartTime(slotIndex);
  const slotEnd = slotStartTime(slotIndex + 1);
  return events.filter((event) => event.startTime < slotEnd && event.endTime > slotStart);
}

type DayCell =
  | { kind: "slot"; slotIndex: number; span: number; state: SlotState; locked: boolean }
  | { kind: "events"; slotIndex: number; span: number; events: TherapistReservation[] };

// Walks a day's slots once and merges runs into single spanning cells: a
// reservation merges forward only while the exact same single reservation
// continues (a >1hr appointment stays one appointment), and a plain slot
// merges forward while the state stays the same — a whole "施術可能 9:00-12:00"
// morning becomes one band, and only a break/unavailable/reservation slot
// interrupts it. See the week-view mockup this mirrors. `lockedUpTo` (today's
// current-time boundary) also forces a break in the band, even across equal
// states, so the locked and editable portions never share one cell.
function buildDayCells(day: DayData): DayCell[] {
  const cells: DayCell[] = [];
  let i = 0;
  while (i < SLOT_COUNT) {
    const events = findEventsForSlot(day.events, i);
    if (events.length === 1) {
      let span = 1;
      while (i + span < SLOT_COUNT) {
        const next = findEventsForSlot(day.events, i + span);
        if (next.length !== 1 || next[0].id !== events[0].id) break;
        span++;
      }
      cells.push({ kind: "events", slotIndex: i, span, events });
      i += span;
    } else if (events.length > 1) {
      cells.push({ kind: "events", slotIndex: i, span: 1, events });
      i += 1;
    } else {
      const state = day.slots[i] ?? "unavailable";
      const locked = i < day.lockedUpTo;
      let span = 1;
      while (
        i + span < SLOT_COUNT &&
        i + span < day.lockedUpTo === locked && // don't cross the today lock boundary
        findEventsForSlot(day.events, i + span).length === 0 &&
        (day.slots[i + span] ?? "unavailable") === state
      ) {
        span++;
      }
      cells.push({ kind: "slot", slotIndex: i, span, state, locked });
      i += span;
    }
  }
  return cells;
}

// A merged band can cover several hours in one <button>; this maps a click's
// vertical position back to the exact hour within that band, so painting a
// single hour inside a wider band still works precisely.
function resolveSlotIndex(e: { clientY: number; currentTarget: HTMLElement }, cell: { slotIndex: number; span: number }): number {
  const rect = e.currentTarget.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  const withinSpan = Math.max(0, Math.min(cell.span - 1, Math.floor(offsetY / ROW_PITCH_PX)));
  return cell.slotIndex + withinSpan;
}

function toShortTime(value: string) {
  const [hourStr, minuteStr] = value.split(":");
  const minute = Number(minuteStr);
  return minute === 0 ? `${Number(hourStr)}:00` : `${Number(hourStr)}:${minuteStr}`;
}

function ScheduleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

// A reservation that's already started (or is on a past day) can't be
// cancelled or rescheduled — "undoing" a session that already happened (or is
// happening right now) doesn't mean anything. Mirrors the availability grid's
// own current-time lock (see DayData.lockedUpTo).
function isEventLocked(event: TherapistReservation, day: DayData, nowTime: string): boolean {
  return day.isPast || (day.isToday && event.startTime <= nowTime);
}

export function ScheduleView({
  name,
  days: initialDays,
  weekLabel,
  prevWeekIso,
  nextWeekIso,
  notification,
  nowTime,
}: {
  name: string;
  days: DayData[];
  weekLabel: string;
  prevWeekIso: string;
  nextWeekIso: string;
  notification: NotificationSettings | null;
  nowTime: string;
}) {
  const [days, setDays] = useState(initialDays);
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [openEvent, setOpenEvent] = useState<TherapistReservation | null>(null);
  // Reservations a paint attempt (click or drag) touched but couldn't
  // overwrite — surfaced after the paint gesture ends so the therapist can
  // explicitly cancel or reschedule them instead of the edit silently
  // dropping that cell.
  const [blockedEvents, setBlockedEvents] = useState<TherapistReservation[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [isRescheduling, startRescheduleTransition] = useTransition();
  const [rescheduleMessage, setRescheduleMessage] = useState<string | null>(null);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  const [clipboardMonday, setClipboardMonday] = useState<string | null>(null);
  const [pasteWeekCount, setPasteWeekCount] = useState(1);
  const [isPasting, startPasteTransition] = useTransition();
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);

  // Painting: pick a tool (施術可能/不可/休憩) above the grid, then click or drag
  // over cells to set them to that tool's state — the tool never changes based on
  // what a cell already contains, so it's always clear what a drag will produce.
  const [selectedTool, setSelectedTool] = useState<SlotState>("available");
  const [isPainting, setIsPainting] = useState(false);
  // Which exact slot the cursor is over right now, so a merged multi-hour
  // band can highlight only that one slot instead of drawing every internal
  // boundary in the band at once.
  const [hoverSlot, setHoverSlot] = useState<{ dayIndex: number; slotIndex: number } | null>(null);

  useEffect(() => {
    // Re-syncs local edits to the server's data whenever it changes — after a
    // Save (so a subsequent Paste sees this week's just-saved state) and, more
    // importantly, after a Paste/Copy/Cancel Server Action revalidates this
    // same route: the component isn't remounted (same key), so without this
    // the grid would keep showing stale content until a manual reload.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDays(initialDays);
  }, [initialDays]);

  useEffect(() => {
    // Reads localStorage (unavailable during SSR) so the paste button's enabled
    // state can't mismatch between server and client markup at hydration time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClipboardMonday(window.localStorage.getItem(CLIPBOARD_KEY));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNewDate(openEvent?.dateIso ?? "");
    setNewStartTime(openEvent?.startTime ?? "");
    setRescheduleMessage(null);
    setCancelMessage(null);
  }, [openEvent]);

  useEffect(() => {
    if (!isPainting) return;
    function stopPainting() {
      setIsPainting(false);
    }
    window.addEventListener("mouseup", stopPainting);
    return () => window.removeEventListener("mouseup", stopPainting);
  }, [isPainting]);

  function setSlot(dayIndex: number, slotIndex: number, state: SlotState) {
    setSavedAt(null);
    setDays((prev) =>
      prev.map((day, di) =>
        di !== dayIndex ? day : { ...day, slots: day.slots.map((s, si) => (si === slotIndex ? state : s)) }
      )
    );
  }

  function blockOnEvents(events: TherapistReservation[]): boolean {
    if (events.length === 0) return false;
    setBlockedEvents((prev) => {
      const known = new Set(prev.map((e) => e.id));
      const additions = events.filter((e) => !known.has(e.id));
      return additions.length ? [...prev, ...additions] : prev;
    });
    return true;
  }

  function isLocked(dayIndex: number, slotIndex: number): boolean {
    const day = days[dayIndex];
    return day.isPast || slotIndex < day.lockedUpTo;
  }

  function handlePaintStart(dayIndex: number, slotIndex: number) {
    if (isLocked(dayIndex, slotIndex)) return;
    if (blockOnEvents(findEventsForSlot(days[dayIndex].events, slotIndex))) return;
    setIsPainting(true);
    setSlot(dayIndex, slotIndex, selectedTool);
  }

  function handlePaintEnter(dayIndex: number, slotIndex: number) {
    if (!isPainting || isLocked(dayIndex, slotIndex)) return;
    if (blockOnEvents(findEventsForSlot(days[dayIndex].events, slotIndex))) return;
    setSlot(dayIndex, slotIndex, selectedTool);
  }

  const hasEditableDay = days.some((day) => !day.isPast);
  const weekReservationCount = days.reduce((sum, day) => sum + day.events.length, 0);

  function handleSave() {
    startTransition(async () => {
      await saveWeekAvailability(
        days.filter((day) => !day.isPast).map((day) => ({ dateIso: day.dateIso, slots: day.slots }))
      );
      setSavedAt(Date.now());
    });
  }

  function handleCopyWeek() {
    window.localStorage.setItem(CLIPBOARD_KEY, days[0].dateIso);
    setClipboardMonday(days[0].dateIso);
    setPasteMessage(null);
  }

  function handleClearClipboard() {
    window.localStorage.removeItem(CLIPBOARD_KEY);
    setClipboardMonday(null);
    setPasteMessage(null);
  }

  function handlePaste() {
    if (!clipboardMonday) return;
    startPasteTransition(async () => {
      await copyWeekAvailability(clipboardMonday, days[0].dateIso, pasteWeekCount);
      setPasteMessage(pasteWeekCount > 1 ? `${pasteWeekCount}週分、貼り付けました` : "貼り付けました");
    });
  }

  function handleCancelReservation(reservationId: string) {
    startTransition(async () => {
      const result = await cancelReservation(reservationId);
      if (result.status === "already_started") {
        setCancelMessage("開始済みの予約はキャンセルできません");
      } else {
        setOpenEvent(null);
      }
    });
  }

  function handleReschedule() {
    if (!openEvent || !newDate || !newStartTime) return;
    startRescheduleTransition(async () => {
      const result = await rescheduleReservation(openEvent.id, newDate, newStartTime);
      if (result.status === "ok") {
        setOpenEvent(null);
      } else if (result.status === "conflict") {
        setRescheduleMessage(`${result.conflictingClientName}様がすでに予約されています`);
      } else if (result.status === "past") {
        setRescheduleMessage("過去の日時には変更できません");
      } else {
        setRescheduleMessage("変更できませんでした");
      }
    });
  }

  function handleToggleNotification() {
    if (!notification) return;
    startTransition(() => {
      setBookingNotificationEnabled(!notification.enabled);
    });
  }

  const openEventDay = openEvent ? (days.find((d) => d.dateIso === openEvent.dateIso) ?? null) : null;
  const openEventLocked = openEvent !== null && openEventDay !== null && isEventLocked(openEvent, openEventDay, nowTime);

  return (
    <div className="min-h-dvh flex bg-bg">
      {/* Sidebar */}
      <div className="w-[220px] shrink-0 bg-surface border-r border-border flex flex-col py-6">
        <div className="flex items-center gap-2.5 px-5 pb-5 border-b border-border mb-4">
          <div className="w-[30px] h-[30px] rounded-[9px] overflow-hidden shrink-0">
            <Image src="/icon.png" alt="マッサマン" width={30} height={30} className="w-full h-full object-cover" />
          </div>
          <span className="flex flex-col leading-tight">
            <span className="font-sans font-black text-sm tracking-[-0.02em]">マッサマン</span>
            <span className="font-heading text-[8px] tracking-wide text-ink-faint">
              <b>Massa</b>ge <b>Man</b>ager
            </span>
          </span>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          <Link
            href="/schedule"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13px] font-medium bg-role-therapist-soft text-role-therapist"
          >
            <ScheduleIcon />
            マイスケジュール
          </Link>
        </nav>

        <div className="grow" />

        <div className="px-5 pt-4 border-t border-border flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-role-therapist-soft flex items-center justify-center text-xs text-role-therapist font-medium shrink-0">
            {name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="text-xs truncate">{name}</div>
            <div className="text-[10px] text-ink-faint">マッサージ師</div>
          </div>
        </div>

        <form action={logout} className="px-5 pt-3">
          <button type="submit" className="w-full h-9 rounded-lg border border-destructive text-destructive text-xs font-medium bg-surface">
            ログアウト
          </button>
        </form>
      </div>

      {/* Main */}
      <div className="grow p-8 flex flex-col gap-4 overflow-y-auto">
        <h1 className="text-lg">マイスケジュール</h1>

        <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-3 flex-wrap">
          {!clipboardMonday ? (
            <>
              <span className="text-xs text-ink-faint">この週の保存済みの内容を、他の週にも使い回せます</span>
              <button
                type="button"
                onClick={handleCopyWeek}
                className="h-9 px-4 rounded-lg bg-role-therapist-soft text-role-therapist text-xs font-medium shrink-0"
              >
                この週をコピー
              </button>
            </>
          ) : (
            <>
              <span className="text-xs text-ink-faint shrink-0">
                {clipboardMonday === days[0]?.dateIso
                  ? "この週をコピー中"
                  : `${formatMondayLabel(clipboardMonday)}の週をコピー中`}
              </span>
              {clipboardMonday !== days[0]?.dateIso && (
                <>
                  <label className="flex items-center gap-1.5 text-xs text-ink-faint shrink-0">
                    ここから
                    <input
                      type="number"
                      min={1}
                      max={26}
                      value={pasteWeekCount}
                      onChange={(e) => setPasteWeekCount(Math.max(1, Math.min(26, Number(e.target.value) || 1)))}
                      className="w-14 h-9 rounded-lg border border-border bg-surface px-2 text-xs mono text-center"
                    />
                    週分
                  </label>
                  <button
                    type="button"
                    disabled={isPasting}
                    onClick={handlePaste}
                    className="h-9 px-4 rounded-lg bg-role-therapist text-white text-xs font-medium disabled:opacity-50 shrink-0"
                  >
                    {isPasting ? "貼り付け中…" : "貼り付け"}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleClearClipboard}
                className="h-9 px-3 rounded-lg border border-border text-ink-faint text-xs shrink-0"
              >
                コピーを解除
              </button>
              {pasteMessage && <span className="text-xs text-role-therapist shrink-0">{pasteMessage}</span>}
            </>
          )}
        </div>

        <div className="grow flex gap-4.5 overflow-hidden">
          <div className="grow overflow-y-auto rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link
                  href={`/schedule?week=${prevWeekIso}`}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-ink-faint"
                  aria-label="前の週"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </Link>
                <p className="m-0 text-xs text-ink-faint">{weekLabel}</p>
                <Link
                  href={`/schedule?week=${nextWeekIso}`}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-ink-faint"
                  aria-label="次の週"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              </div>
              <div className="flex items-center gap-1.5">
                {TOOL_OPTIONS.map((tool) => (
                  <button
                    key={tool.state}
                    type="button"
                    onClick={() => setSelectedTool(tool.state)}
                    className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] ${
                      selectedTool === tool.state
                        ? "bg-role-therapist-soft text-role-therapist font-medium ring-1 ring-role-therapist"
                        : "text-ink-faint"
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-[3px] inline-block ${tool.swatchClass}`} />
                    {tool.label}
                  </button>
                ))}
                <span className="flex items-center gap-1.5 h-8 px-3 text-[11px] text-ink-faint">
                  <span className="w-2.5 h-2.5 rounded-[3px] inline-block bg-role-therapist border-2 border-accent-strong" />
                  予約あり
                </span>
              </div>
            </div>
            {hasEditableDay ? (
              <p className="m-0 -mt-2 text-[11px] text-ink-faint">
                上で選んだ状態を、クリックまたはドラッグでマスに適用できます。予約が入っているマスはクリックで詳細を表示します。
              </p>
            ) : (
              <p className="m-0 -mt-2 text-[11px] text-destructive">
                過去の週は内容の確認のみできます(編集・保存はできません)。
              </p>
            )}

            <div
              className="grid gap-1 select-none"
              onMouseLeave={() => setHoverSlot(null)}
              style={{
                gridTemplateColumns: `64px repeat(${days.length}, 1fr)`,
                gridTemplateRows: `${ROW_HEIGHT_PX}px repeat(${SLOT_COUNT}, ${ROW_HEIGHT_PX}px)`,
              }}
            >
              <div style={{ gridColumn: 1, gridRow: 1 }} />
              {days.map(
                (day, dayIndex) =>
                  day.isToday && (
                    // Two separate boxes (header, body) rather than one spanning both —
                    // a single box spanning multiple grid rows also paints over the
                    // gap between them, which is what made the date and the cells
                    // below it read as one glued-together block.
                    <div key={`today-bg-${day.dateIso}`} className="contents">
                      <div style={{ gridColumn: dayIndex + 2, gridRow: 1 }} className="bg-accent-soft rounded-lg" />
                      <div
                        style={{ gridColumn: dayIndex + 2, gridRow: `2 / span ${SLOT_COUNT}` }}
                        className="bg-accent-soft/40 rounded-xl"
                      />
                    </div>
                  )
              )}

              {days.map((day, dayIndex) => (
                <div
                  key={day.dateIso}
                  style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
                  className="flex items-center justify-center rounded-lg"
                >
                  <span
                    className={`mono text-[11px] font-medium ${
                      day.isToday ? "text-accent-strong" : day.isPast ? "text-ink-faint" : "text-ink-soft"
                    }`}
                  >
                    {day.label}
                    {day.isPast && "(終了)"}
                    {day.isToday && "(本日)"}
                  </span>
                </div>
              ))}

              {Array.from({ length: SLOT_COUNT }, (_, slotIndex) =>
                // Slots are 30min but the gutter only labels the hour marks —
                // otherwise every half-hour row would print its own label and
                // clutter the axis, even though most bands still span hours.
                slotIndex % SLOTS_PER_HOUR === 0 ? (
                  <div key={slotIndex} style={{ gridColumn: 1, gridRow: slotIndex + 2 }} className="flex items-center justify-end pr-2">
                    <span className="mono text-[11px] text-ink-faint">{slotStartTime(slotIndex)}</span>
                  </div>
                ) : null
              )}

              {days.map((day, dayIndex) =>
                buildDayCells(day).map((cell) => {
                  if (cell.kind === "slot") {
                    const rangeText = `${toShortTime(slotStartTime(cell.slotIndex))}–${toShortTime(slotStartTime(cell.slotIndex + cell.span))}`;
                    const disabled = day.isPast || cell.locked;
                    // A lone 30min slot (span < 1hr) is too short to hold the
                    // usual two-line label + range stack — at ROW_HEIGHT_PX
                    // tall, that overflowed and got clipped by overflow-hidden,
                    // which read as "the text shrank". Collapse to one compact
                    // line instead of shrinking the row further.
                    const compact = cell.span < SLOTS_PER_HOUR;
                    const hovered =
                      hoverSlot?.dayIndex === dayIndex &&
                      hoverSlot.slotIndex >= cell.slotIndex &&
                      hoverSlot.slotIndex < cell.slotIndex + cell.span;
                    return (
                      <button
                        key={`${day.dateIso}-${cell.slotIndex}`}
                        type="button"
                        disabled={disabled}
                        onMouseDown={(e) => handlePaintStart(dayIndex, resolveSlotIndex(e, cell))}
                        onMouseMove={(e) => {
                          const slotIndex = resolveSlotIndex(e, cell);
                          handlePaintEnter(dayIndex, slotIndex);
                          setHoverSlot({ dayIndex, slotIndex });
                        }}
                        onDragStart={(e) => e.preventDefault()}
                        style={{ gridColumn: dayIndex + 2, gridRow: `${cell.slotIndex + 2} / span ${cell.span}` }}
                        className={`relative rounded-lg flex flex-col items-center justify-center overflow-hidden ${
                          compact ? "px-2 py-0" : "px-2.5 py-1.5"
                        } ${STATE_CLASSES[cell.state]} ${
                          disabled ? "opacity-40 cursor-not-allowed" : "hover:ring-2 hover:ring-inset hover:ring-ink/25"
                        }`}
                      >
                        {!disabled && hovered && cell.span > 1 && (
                          <div
                            className="absolute left-0 right-0 border-y-2 border-ink/30 pointer-events-none"
                            style={{
                              top: (hoverSlot!.slotIndex - cell.slotIndex) * ROW_PITCH_PX,
                              height: ROW_HEIGHT_PX,
                            }}
                          />
                        )}
                        {compact ? (
                          <span className="mono text-[10px] font-medium truncate w-full text-left">
                            {STATE_LABELS[cell.state]} {rangeText}
                          </span>
                        ) : (
                          <>
                            <span className="text-xs font-medium truncate w-full text-center">{STATE_LABELS[cell.state]}</span>
                            <span className="mono text-[10px] opacity-80 truncate w-full text-center">{rangeText}</span>
                          </>
                        )}
                      </button>
                    );
                  }

                  // One or more reservations overlapping this hour (see the
                  // "up to 2 clients in one hour" overflow case) — stack them
                  // as separate clickable chips inside the same grid cell.
                  return (
                    <div
                      key={`${day.dateIso}-${cell.slotIndex}`}
                      style={{ gridColumn: dayIndex + 2, gridRow: `${cell.slotIndex + 2} / span ${cell.span}` }}
                      className="flex flex-col gap-0.5"
                    >
                      {cell.events.map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          disabled={day.isPast}
                          onMouseDown={() => setOpenEvent(event)}
                          onDragStart={(e) => e.preventDefault()}
                          title={`${event.clientName} ${toShortTime(event.startTime)}-${toShortTime(event.endTime)}`}
                          className={`grow rounded-lg px-1.5 overflow-hidden flex items-center justify-center text-center text-[10px] font-medium truncate bg-role-therapist text-white border-2 border-accent-strong ${
                            day.isPast ? "opacity-40 cursor-not-allowed" : "hover:border-white"
                          }`}
                        >
                          {event.clientName}
                        </button>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="w-72 shrink-0 flex flex-col gap-4">
            <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-1">
              <span className="text-xs text-ink-faint">今週の予約件数</span>
              <span className="mono text-2xl font-bold text-role-therapist">
                {weekReservationCount}
                <span className="text-sm text-ink-faint"> 件</span>
              </span>
            </div>

            <p className="text-[11px] text-ink-faint leading-relaxed">
              体調不良などやむを得ない場合は、予約マスをクリックして「キャンセル」できます。利用者には自動で通知されます。
            </p>

            {notification && (
              <div className="rounded-2xl border border-border bg-surface p-4">
                <h3 className="text-sm mb-0.5">予約 / キャンセル通知（施術者向け）</h3>

                <div className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <div className="text-[13px]">通知</div>
                    <div className="text-[11px] text-ink-faint mt-0.5">Slackに通知（#massage-room）</div>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleToggleNotification}
                    aria-pressed={notification.enabled}
                    className={`w-[38px] h-[22px] rounded-full relative shrink-0 disabled:opacity-50 ${
                      notification.enabled ? "bg-accent" : "bg-surface-2 border border-border"
                    }`}
                  >
                    <span
                      className="absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-[left]"
                      style={{ left: notification.enabled ? 18 : 2 }}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 py-2.5 border-t border-border">
                  <div>
                    <div className="text-[13px]">通知タイミング</div>
                    <div className="text-[11px] text-ink-faint mt-0.5">予約時刻の何分前に届けるか</div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 shrink-0">
                    <span className="mono text-[13px] font-bold text-accent-strong">{notification.minutesBefore}</span>
                    <span className="text-xs text-ink-faint">分前</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {savedAt && <span className="text-xs text-role-therapist">保存しました</span>}
          <button
            type="button"
            disabled={isPending || !hasEditableDay}
            onClick={handleSave}
            className="self-end w-[220px] h-12 rounded-2xl bg-role-therapist text-white text-sm font-medium disabled:opacity-60"
          >
            {isPending ? "保存中…" : "この内容で保存する"}
          </button>
        </div>
      </div>

      {openEvent && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center p-6 z-10"
          onClick={() => setOpenEvent(null)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="mono text-sm font-bold text-role-therapist">
                  {formatMondayLabel(openEvent.dateIso)} {toShortTime(openEvent.startTime)}-{toShortTime(openEvent.endTime)}
                </div>
                <div className="text-base font-medium mt-0.5">{openEvent.clientName}</div>
                <div className="text-xs text-ink-faint mt-0.5 flex items-center gap-1.5">
                  {openEvent.department && <span>{openEvent.department}</span>}
                  {openEvent.roomName && <span>{openEvent.department ? "・" : ""}{openEvent.roomName}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenEvent(null)}
                aria-label="閉じる"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-faint shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="rounded-xl bg-surface-2 p-3 text-sm text-ink-soft leading-relaxed min-h-12">
              {openEvent.note || "メモはありません"}
            </div>

            {openEventLocked ? (
              <p className="m-0 text-xs text-destructive">
                この予約はすでに開始しているため、キャンセル・日時変更はできません。
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-ink-faint">マッサージ師都合で日時を変更する</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="h-9 rounded-lg border border-border bg-surface px-2 text-sm mono grow"
                    />
                    <input
                      type="time"
                      step={60}
                      value={newStartTime}
                      onChange={(e) => setNewStartTime(e.target.value)}
                      className="h-9 rounded-lg border border-border bg-surface px-2 text-sm mono grow"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={
                      isRescheduling ||
                      !newDate ||
                      !newStartTime ||
                      (newDate === openEvent.dateIso && newStartTime === openEvent.startTime)
                    }
                    onClick={handleReschedule}
                    className="h-9 px-3 rounded-lg bg-role-therapist-soft text-role-therapist text-xs font-medium disabled:opacity-50"
                  >
                    {isRescheduling ? "変更中…" : "日時を変更"}
                  </button>
                  {rescheduleMessage && <span className="text-xs text-destructive">{rescheduleMessage}</span>}
                </div>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleCancelReservation(openEvent.id)}
                  className="h-10 rounded-lg bg-surface text-destructive border border-destructive text-sm font-medium disabled:opacity-50"
                >
                  この予約をキャンセル(マッサージ師都合)
                </button>
                {cancelMessage && <span className="text-xs text-destructive">{cancelMessage}</span>}
              </>
            )}
          </div>
        </div>
      )}

      {blockedEvents.length > 0 && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center p-6 z-10"
          onClick={() => setBlockedEvents([])}
        >
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-medium">この時間には利用者の予約があります</div>
            <p className="text-xs text-ink-faint leading-relaxed">
              予約が入っている時間を、無断で「不可」「休憩」にすることはできません。先にキャンセルするか、日時を変更してください。
            </p>
            <div className="flex flex-col gap-1.5">
              {blockedEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => {
                    setOpenEvent(event);
                    setBlockedEvents((prev) => prev.filter((e) => e.id !== event.id));
                  }}
                  className="flex items-center justify-between h-10 px-3 rounded-lg border border-border text-left text-sm hover:bg-surface-2"
                >
                  <span className="truncate">{event.clientName}</span>
                  <span className="mono text-xs text-ink-faint shrink-0 ml-2">
                    {toShortTime(event.startTime)}-{toShortTime(event.endTime)}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setBlockedEvents([])}
              className="h-9 rounded-lg text-xs text-ink-faint"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
