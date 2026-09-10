"use client";

import Link from "next/link";
import { useState } from "react";
import { logout } from "@/app/actions/auth";

export function AccountMenu({
  name,
  roleLabel,
  menuPlacement = "down",
  avatarClassName = "bg-role-user-soft text-role-user",
}: {
  name: string;
  roleLabel: string;
  menuPlacement?: "up" | "down";
  avatarClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const initial = name.trim().charAt(0) || "?";

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-bg"
      >
        <span className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-medium ${avatarClassName}`}>
          {initial}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-[150px] truncate text-sm font-medium text-ink">{name}</span>
          <span className="block text-xs text-ink-faint">{roleLabel}</span>
        </span>
        <span aria-hidden className="ml-1 text-xs text-ink-faint">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div role="menu" className={`absolute right-0 z-10 w-48 rounded-xl border border-border bg-surface p-1.5 ${menuPlacement === "up" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"}`}>
          <Link href="/notifications" role="menuitem" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-ink-soft hover:bg-bg">
            通知設定
          </Link>
          <div className="my-1 border-t border-border" />
          <form action={logout}>
            <button type="submit" role="menuitem" className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-destructive hover:bg-bg">
              ログアウト
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
