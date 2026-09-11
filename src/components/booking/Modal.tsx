"use client";

export function Modal(props: { onClose?: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5">
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
        {props.onClose && (
          <button
            onClick={props.onClose}
            aria-label="閉じる"
            className="absolute right-4 top-4 text-lg text-ink-faint"
          >
            ✕
          </button>
        )}
        {props.children}
      </div>
    </div>
  );
}
