"use client";

import Link from "next/link";
import { Modal } from "@/components/booking/Modal";
import { formatDateWithWeekday, formatTimeLabel } from "@/lib/booking/schedule";
import type { MyReservation } from "@/lib/booking/data";

export function ReservationDetailDialog({
  reservation,
  onClose,
}: {
  reservation: MyReservation;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <p className="mb-1 text-xs text-ink-faint">予約の詳細</p>
      <p className="mono mb-1 text-lg font-bold text-accent-strong">
        {formatDateWithWeekday(reservation.date)} {formatTimeLabel(reservation.startMinutes)}〜
      </p>
      <p className="mb-1 text-xs text-ink-faint">施術時間 {reservation.durationMinutes}分</p>
      {reservation.note && (
        <div className="mb-5">
          <p className="mb-1 text-xs text-ink-faint">施術してほしい部位・伝えたいこと（任意）</p>
          <p className="whitespace-pre-wrap text-sm text-ink-soft">{reservation.note}</p>
        </div>
      )}
      <div className={`flex flex-col gap-2.5 ${reservation.note ? "" : "mt-5"}`}>
        {/* Lands on the booking page's own slot and opens its cancel-confirmation dialog directly. */}
        <Link
          href={`/booking?date=${reservation.date}&startMinutes=${reservation.startMinutes}`}
          className="flex h-11 w-full items-center justify-center rounded-xl border border-destructive text-sm text-destructive"
        >
          予約をキャンセル
        </Link>
      </div>
    </Modal>
  );
}
