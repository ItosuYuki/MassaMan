"use client";

import { Modal } from "./Modal";
import { DressCodeNotice } from "./DressCodeNotice";

export function ConfirmDialog(props: {
  step: "confirm" | "success";
  dateLabel: string;
  timeLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (props.step === "success") {
    return (
      <Modal onClose={props.onClose}>
        <p className="mb-3 text-sm font-medium text-role-user">予約が完了しました</p>
        <p className="mono mb-4 text-lg font-bold text-accent-strong">
          {props.dateLabel} {props.timeLabel}
        </p>
        <DressCodeNotice />
      </Modal>
    );
  }

  return (
    <Modal onClose={props.onClose}>
      <p className="mb-1 text-xs text-ink-faint">予約日時</p>
      <p className="mono mb-4 text-lg font-bold text-accent-strong">
        {props.dateLabel} {props.timeLabel}
      </p>
      <p className="mb-5 text-sm text-ink">予約を確定しますか？</p>
      {props.error && <p className="mb-3 text-xs text-destructive">{props.error}</p>}
      <button
        onClick={props.onConfirm}
        disabled={props.pending}
        className="h-11 w-full rounded-xl bg-accent text-sm font-medium text-white disabled:opacity-40"
      >
        {props.pending ? "予約しています…" : "はい"}
      </button>
    </Modal>
  );
}
