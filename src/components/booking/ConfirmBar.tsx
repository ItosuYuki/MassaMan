"use client";

export function ConfirmBar(props: {
  label: string;
  disabled: boolean;
  pending: boolean;
  error: string | null;
  success: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="sticky bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-5 pb-6 pt-4 sm:static sm:bg-none sm:p-0">
      {props.error && <p className="mb-2 text-xs text-destructive">{props.error}</p>}
      {props.success && <p className="mb-2 text-xs text-role-user">予約が完了しました。</p>}
      <button
        onClick={props.onConfirm}
        disabled={props.disabled || props.pending}
        className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-medium text-white disabled:opacity-40 sm:h-12.5"
      >
        {props.pending ? "予約しています…" : `この内容で予約する・${props.label}`}
      </button>
    </div>
  );
}
