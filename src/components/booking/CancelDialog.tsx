"use client";

import { Modal } from "./Modal";

export function CancelDialog(props: {
  dateLabel: string;
  timeLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal onClose={props.onDismiss}>
      <p className="mb-1 text-xs text-ink-faint">この予約</p>
      <p className="mono mb-4 text-lg font-bold text-accent-strong">
        {props.dateLabel} {props.timeLabel}
      </p>
      <p className="mb-5 text-sm text-ink">キャンセルしますか？</p>
      {props.error && <p className="mb-3 text-xs text-destructive">{props.error}</p>}
      <div className="flex gap-3">
        <button
          onClick={props.onDismiss}
          className="h-11 flex-1 rounded-xl border border-border text-sm text-ink-soft"
        >
          いいえ
        </button>
        <button
          onClick={props.onConfirm}
          disabled={props.pending}
          className="h-11 flex-1 rounded-xl border border-destructive text-sm text-destructive disabled:opacity-40"
        >
          {props.pending ? "処理中…" : "はい"}
        </button>
      </div>
    </Modal>
  );
}
