"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { logout } from "@/app/actions/auth";
import { cancelReservation, setBookingNotificationEnabled } from "@/app/actions/bookings";
import type { TherapistReservation } from "@/lib/reservations";
import type { NotificationSettings } from "@/lib/notifications";

type DayData = {
  key: string;
  label: string;
  countLabel: string;
  dateIso: string;
  events: TherapistReservation[];
};

const START_HOUR = 9;
const END_HOUR = 20;
const PX_PER_MINUTE = 0.9; // 54px per hour, matches the mockup's hour-line spacing
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

function parseTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function timeTopPx(time: string) {
  const { hour, minute } = parseTime(time);
  return ((hour - START_HOUR) * 60 + minute) * PX_PER_MINUTE;
}

function durationMinutes(start: string, end: string) {
  const a = parseTime(start);
  const b = parseTime(end);
  return (b.hour - a.hour) * 60 + (b.minute - a.minute);
}

function toShortTime(value: string) {
  const { hour, minute } = parseTime(value);
  return minute === 0 ? `${hour}:00` : `${hour}:${String(minute).padStart(2, "0")}`;
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

export function BookingsView({
  name,
  days,
  notification,
}: {
  name: string;
  days: DayData[];
  notification: NotificationSettings | null;
}) {
  const [selectedKey, setSelectedKey] = useState(days[0]?.key);
  const [isPending, startTransition] = useTransition();
  const selectedDay = days.find((day) => day.key === selectedKey) ?? days[0];

  function handleCancel(reservationId: string) {
    startTransition(() => {
      cancelReservation(reservationId);
    });
  }

  function handleToggleNotification() {
    if (!notification) return;
    startTransition(() => {
      setBookingNotificationEnabled(!notification.enabled);
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
          <Link href="/schedule" className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13px] text-ink-soft">
            <ScheduleIcon />
            勤務時間登録
          </Link>
          <Link
            href="/bookings"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13px] font-medium bg-role-therapist-soft text-role-therapist"
          >
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
      <div className="grow p-8 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg">予約確認</h1>
          <div className="flex gap-1.5">
            {days.map((day) => (
              <button
                key={day.key}
                type="button"
                onClick={() => setSelectedKey(day.key)}
                className={`px-4 py-2 rounded-full text-[13px] shrink-0 ${
                  day.key === selectedDay?.key ? "bg-role-therapist text-white font-medium" : "bg-surface-2 text-ink-faint"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grow flex gap-4.5 overflow-hidden">
          {/* Day timeline */}
          <div className={`grow overflow-y-auto rounded-2xl border border-border bg-surface p-5 ${isPending ? "opacity-60" : ""}`}>
            <div className="relative" style={{ height: (END_HOUR - START_HOUR) * 54, marginTop: 7 }}>
              {HOURS.map((hour) => (
                <div key={hour}>
                  <div className="absolute left-0 right-0 border-t border-border" style={{ top: timeTopPx(`${hour}:00`) }} />
                  <span className="absolute left-0 w-[52px] text-[10px] text-ink-faint" style={{ top: timeTopPx(`${hour}:00`) - 7 }}>
                    {hour}:00
                  </span>
                </div>
              ))}

              {selectedDay && selectedDay.events.length === 0 && (
                <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-faint">この日の予約はありません</p>
              )}

              {selectedDay?.events.map((event) => (
                <div
                  key={event.id}
                  className="absolute left-16 right-3 rounded-[9px] px-3 py-1.5 border-l-4 bg-role-therapist-soft border-role-therapist"
                  style={{
                    top: timeTopPx(event.startTime),
                    minHeight: durationMinutes(event.startTime, event.endTime) * PX_PER_MINUTE,
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="mono text-[11px] font-bold shrink-0 text-role-therapist">
                        {toShortTime(event.startTime)}-{toShortTime(event.endTime)}
                      </span>
                      <span className="text-xs font-medium truncate">{event.clientName}</span>
                      {event.department && <span className="text-[10px] text-ink-faint shrink-0">{event.department}</span>}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleCancel(event.id)}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-surface text-destructive border border-destructive disabled:opacity-50"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                  {event.note && <div className="text-[11px] text-ink-soft mt-0.5">{event.note}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="w-80 shrink-0 flex flex-col gap-4">
            <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-1">
              <span className="text-xs text-ink-faint">{selectedDay?.countLabel}の予約件数</span>
              <span className="mono text-2xl font-bold text-role-therapist">
                {selectedDay?.events.length ?? 0}
                <span className="text-sm text-ink-faint"> 件</span>
              </span>
            </div>

            <p className="text-[11px] text-ink-faint leading-relaxed">
              体調不良などやむを得ない場合は、各予約を「キャンセル」からキャンセルできます。利用者には自動で通知されます。
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
      </div>
    </div>
  );
}
