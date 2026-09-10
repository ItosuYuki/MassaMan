"use client";

import { Modal } from "./Modal";

export function CancelDialog(props: {
  step: "confirm" | "success";
  dateLabel: string;
  timeLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  if (props.step === "success") {
    return (
      <Modal onClose={props.onDismiss}>
        <p className="mb-4 text-sm font-medium text-role-user">キャンセルを完了しました</p>
        <button
          onClick={props.onDismiss}
          className="h-11 w-full rounded-xl border border-border text-sm text-ink-soft"
        >
          閉じる
        </button>
      </Modal>
    );
  }

  return (
    <Modal onClose={props.onDismiss}>
      <p className="mb-1 text-xs text-ink-faint">現在の予約</p>
      <p className="mono mb-4 text-lg font-bold text-accent-strong">
        {props.dateLabel} {props.timeLabel}
      </p>
      <p className="mb-5 text-sm text-ink">キャンセルしますか？</p>
      {props.error && <p className="mb-3 text-xs text-destructive">{props.error}</p>}
      <div className="flex gap-3">
        <button
          onClick={props.onConfirm}
          disabled={props.pending}
          className="h-11 flex-1 rounded-xl border border-destructive text-sm text-destructive disabled:opacity-40"
        >
          {props.pending ? "処理中…" : "はい"}
        </button>
        <button
          onClick={props.onDismiss}
          className="h-11 flex-1 rounded-xl border border-border text-sm text-ink-soft"
        >
          いいえ
        </button>
      </div>
    </Modal>
  );
}
