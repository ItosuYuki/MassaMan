"use client";

import { useRouter } from "next/navigation";

export function AttributeCheckboxes({
  options,
}: {
  /** Each option carries the full URL to navigate to when ITS checkbox is toggled
   * (computed server-side, since a function prop can't cross the client boundary). */
  options: { value: string; label: string; checked: boolean; href: string }[];
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-3.5">
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer">
          <input
            type="checkbox"
            checked={o.checked}
            onChange={() => router.push(o.href, { scroll: false })}
            className="accent-accent w-3.5 h-3.5"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
