"use client";

import { Modal } from "./Modal";
import { CautionNotice } from "./CautionNotice";

export function ConfirmDialog(props: {
  step: "confirm" | "success";
  dateLabel: string;
  timeLabel: string;
  durationMinutes: number;
  note: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (props.step === "success") {
    return (
      <Modal onClose={props.onClose}>
        <p className="mb-3 text-sm font-medium text-role-user">予約が完了しました</p>
        <p className="mono mb-1 text-lg font-bold text-accent-strong">
          {props.dateLabel} {props.timeLabel}
        </p>
        <p className="mono mb-4 text-xs text-ink-faint">施術時間 {props.durationMinutes}分</p>
        <p className="mb-5 text-xs leading-relaxed text-ink-soft">
          当日は予約時間にマッサージ室へお越しください。
          <br />
          キャンセル・変更がある場合は、できるだけお早めにお手続きをお願いします。
        </p>
        <button
          onClick={props.onClose}
          className="h-11 w-full rounded-xl border border-border text-sm text-ink-soft"
        >
          閉じる
        </button>
      </Modal>
    );
  }

  return (
    <Modal onClose={props.onClose}>
      <p className="mb-1 text-xs text-ink-faint">予約日時</p>
      <p className="mono mb-4 text-lg font-bold text-accent-strong">
        {props.dateLabel} {props.timeLabel}
      </p>
      {props.note && (
        <div className="mb-4">
          <p className="mb-1 text-xs text-ink-faint">施術してほしい部位・伝えたいこと</p>
          <p className="whitespace-pre-wrap text-sm text-ink-soft">{props.note}</p>
        </div>
      )}
      <p className="mb-4 text-sm text-ink">予約を確定しますか？</p>
      <div className="mb-5">
        <CautionNotice />
      </div>
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
