"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";

export function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="メニュー"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-10 w-40 rounded-xl border border-border bg-surface p-1.5">
          <Link
            href="/mypage"
            onClick={() => setOpen(false)}
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-ink-soft"
          >
            マイページ
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-destructive"
            >
              ログアウト
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
