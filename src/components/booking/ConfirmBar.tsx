"use client";

export function ConfirmBar(props: { label: string; disabled: boolean; onOpen: () => void }) {
  return (
    <div className="sticky bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-5 pb-6 pt-4 sm:static sm:bg-none sm:p-0">
      <button
        onClick={props.onOpen}
        disabled={props.disabled}
        className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-medium text-white disabled:opacity-40 sm:h-12.5"
      >
        {`この内容で予約する・${props.label}`}
      </button>
    </div>
  );
}
