"use client";

import { useRouter } from "next/navigation";

export function FilterSelect({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  /** Each option carries the full URL to navigate to when selected (computed server-side). */
  options: { value: string; label: string; href: string }[];
}) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-1.5 rounded-[9px] border border-border bg-surface px-3 py-1.5 text-xs text-ink-soft">
      {label}：
      <select
        value={value}
        onChange={(e) => {
          const href = options.find((o) => o.value === e.target.value)?.href;
          if (href) router.push(href, { scroll: false });
        }}
        className="bg-transparent outline-none text-ink-soft"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
