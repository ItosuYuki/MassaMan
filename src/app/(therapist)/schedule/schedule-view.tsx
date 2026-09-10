"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useState, useTransition } from "react";
import { logout } from "@/app/actions/auth";
import { saveWeekAvailability, copyWeekAvailability } from "@/app/actions/shifts";
import { SLOT_COUNT, slotStartTime, type SlotState } from "@/lib/shift-slots";

type DayData = {
  dateIso: string;
  label: string;
  slots: SlotState[];
  isPast: boolean;
};

const STATE_CLASSES: Record<SlotState, string> = {
  available: "bg-role-therapist text-white",
  unavailable: "bg-surface-2 text-ink-faint border border-border",
  break: "bg-amber-soft text-amber",
};

const TOOL_OPTIONS: { state: SlotState; label: string; swatchClass: string }[] = [
  { state: "available", label: "施術可能", swatchClass: "bg-role-therapist" },
  { state: "unavailable", label: "不可", swatchClass: "bg-surface-2 border border-border" },
  { state: "break", label: "休憩", swatchClass: "bg-amber-soft" },
];

const CLIPBOARD_KEY = "massaman:schedule-clipboard-monday";

function formatMondayLabel(mondayIso: string): string {
  const [, month, day] = mondayIso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function ScheduleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function BookingsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

export function ScheduleView({
  name,
  days: initialDays,
  weekLabel,
  prevWeekIso,
  nextWeekIso,
}: {
  name: string;
  days: DayData[];
  weekLabel: string;
  prevWeekIso: string;
  nextWeekIso: string;
}) {
  const [days, setDays] = useState(initialDays);
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [clipboardMonday, setClipboardMonday] = useState<string | null>(null);
  const [pasteWeekCount, setPasteWeekCount] = useState(1);
  const [isPasting, startPasteTransition] = useTransition();
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);

  // Painting: pick a tool (施術可能/不可/休憩) above the grid, then click or drag
  // over cells to set them to that tool's state — the tool never changes based on
  // what a cell already contains, so it's always clear what a drag will produce.
  const [selectedTool, setSelectedTool] = useState<SlotState>("available");
  const [isPainting, setIsPainting] = useState(false);

  useEffect(() => {
    // Reads localStorage (unavailable during SSR) so the paste button's enabled
    // state can't mismatch between server and client markup at hydration time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClipboardMonday(window.localStorage.getItem(CLIPBOARD_KEY));
  }, []);

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

  function handlePaintStart(dayIndex: number, slotIndex: number) {
    if (days[dayIndex].isPast) return;
    setIsPainting(true);
    setSlot(dayIndex, slotIndex, selectedTool);
  }

  function handlePaintEnter(dayIndex: number, slotIndex: number) {
    if (!isPainting || days[dayIndex].isPast) return;
    setSlot(dayIndex, slotIndex, selectedTool);
  }

  const hasEditableDay = days.some((day) => !day.isPast);

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
            勤務時間登録
          </Link>
          <Link href="/bookings" className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13px] text-ink-soft">
            <BookingsIcon />
            予約確認
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
        <h1 className="text-lg">勤務時間登録</h1>

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

        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3.5 grow">
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
            </div>
          </div>
          {hasEditableDay ? (
            <p className="m-0 -mt-2 text-[11px] text-ink-faint">
              上で選んだ状態を、クリックまたはドラッグでマスに適用できます。
            </p>
          ) : (
            <p className="m-0 -mt-2 text-[11px] text-destructive">
              過去の週は内容の確認のみできます(編集・保存はできません)。
            </p>
          )}

          <div
            className="grow grid gap-1 select-none"
            style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)`, gridAutoRows: "1fr" }}
          >
            <div />
            {days.map((day) => (
              <div key={day.dateIso} className="flex items-center justify-center rounded-lg">
                <span className={`mono text-[11px] font-medium ${day.isPast ? "text-ink-faint" : "text-ink-soft"}`}>
                  {day.label}
                  {day.isPast && "(終了)"}
                </span>
              </div>
            ))}

            {Array.from({ length: SLOT_COUNT }, (_, slotIndex) => (
              <Fragment key={slotIndex}>
                <div className="flex items-center justify-end pr-2">
                  <span className="mono text-[11px] text-ink-faint">{slotStartTime(slotIndex)}</span>
                </div>
                {days.map((day, dayIndex) => (
                  <button
                    key={`${day.dateIso}-${slotIndex}`}
                    type="button"
                    disabled={day.isPast}
                    onMouseDown={() => handlePaintStart(dayIndex, slotIndex)}
                    onMouseEnter={() => handlePaintEnter(dayIndex, slotIndex)}
                    onDragStart={(e) => e.preventDefault()}
                    className={`rounded-lg ${STATE_CLASSES[day.slots[slotIndex] ?? "unavailable"]} ${
                      day.isPast ? "opacity-40 cursor-not-allowed" : ""
                    }`}
                  />
                ))}
              </Fragment>
            ))}
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
    </div>
  );
}
