"use client";

import Image from "next/image";
import { useActionState } from "react";
import { login, type LoginFormState } from "@/app/actions/auth";

function SsoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 8h18" />
    </svg>
  );
}

function Wordmark({ tone }: { tone: "ink" | "white" }) {
  return (
    <span className="flex flex-col leading-tight">
      <span
        className={`font-sans font-[900] text-2xl tracking-[-0.02em] ${
          tone === "white" ? "text-white" : "text-ink"
        }`}
      >
        マッサマン
      </span>
      <span
        className={`font-heading text-xs tracking-wide ${
          tone === "white" ? "text-white/75" : "text-ink-faint"
        }`}
      >
        <b>Massa</b>ge <b>Man</b>ager
      </span>
    </span>
  );
}

function LogoBadge({
  variant,
  size,
}: {
  variant: "blue" | "white";
  size: "lg" | "sm";
}) {
  const badgeStyle =
    variant === "blue"
      ? { background: "var(--color-accent-soft) url(/badge-background.jpg) center/cover no-repeat" }
      : { background: "rgba(255,255,255,.15) url(/badge-background.jpg) center/cover no-repeat" };

  return (
    <div
      className={
        size === "lg"
          ? "w-16 h-16 rounded-[20px] flex items-center justify-center shrink-0"
          : "w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
      }
      style={badgeStyle}
    >
      <Image
        src={variant === "blue" ? "/logo-mermaid-blue.png" : "/logo-mermaid-white.png"}
        alt="マッサマン"
        width={size === "lg" ? 44 : 24}
        height={size === "lg" ? 23 : 13}
        priority
      />
    </div>
  );
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginFormState, FormData>(
    login,
    undefined
  );

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-bg">
      {/* Brand panel — desktop only */}
      <div className="hidden lg:flex lg:w-[520px] lg:shrink-0 bg-accent-strong text-white flex-col justify-between p-14 relative overflow-hidden">
        <div className="flex items-center gap-3 relative">
          <LogoBadge variant="white" size="sm" />
          <Wordmark tone="white" />
        </div>

        <div className="relative">
          <h1 className="text-[34px] leading-relaxed text-balance">
            社内マッサージ室を、
            <br />
            もっと気軽に。
          </h1>
          <p className="mt-4 text-sm leading-loose text-white/75 max-w-[380px]">
            空き状況の確認から予約・キャンセルまで、スマホからもパソコンからも同じアカウントで利用できます。
          </p>
        </div>

        <p className="relative m-0 text-xs text-white/50">Ca-adv Tech Jam 社内システム</p>
      </div>

      {/* Form column — full screen on mobile, right panel on desktop */}
      <div className="flex-1 flex flex-col items-center justify-center gap-7 px-8 py-10">
        {/* Mobile-only logo/wordmark block */}
        <div className="flex flex-col items-center gap-3.5 lg:hidden">
          <LogoBadge variant="blue" size="lg" />
          <div className="text-center">
            <Wordmark tone="ink" />
            <p className="mt-1.5 text-[13px] text-ink-faint">社内マッサージ室 予約システム</p>
          </div>
        </div>

        {/* Desktop-only heading */}
        <div className="hidden lg:block w-full max-w-[340px]">
          <h2 className="text-xl">ログイン</h2>
          <p className="mt-1.5 text-[13px] text-ink-faint">社内アカウントでログインしてください</p>
        </div>

        <form action={formAction} className="w-full max-w-[340px] flex flex-col gap-3">
          <button
            type="button"
            disabled
            title="準備中: 社内SSOログインは現在ご利用いただけません"
            className="flex items-center justify-center gap-2.5 h-[52px] lg:h-[50px] rounded-xl text-sm font-medium bg-accent text-white opacity-50 cursor-not-allowed"
          >
            <SsoIcon />
            社内アカウントでログイン
          </button>

          <div className="flex items-center gap-2.5 text-ink-faint text-xs">
            <div className="flex-1 h-px bg-border" />
            または
            <div className="flex-1 h-px bg-border" />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-soft">社員番号</span>
            <input
              name="employeeId"
              type="text"
              autoComplete="username"
              required
              className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-soft">パスワード</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          {state?.error && (
            <p className="text-xs text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 flex items-center justify-center h-[52px] lg:h-[50px] rounded-xl text-sm font-medium bg-surface text-ink-soft border border-border disabled:opacity-60"
          >
            {pending ? "確認中…" : "社員番号でログイン"}
          </button>
        </form>

        <p className="text-xs text-ink-faint text-center leading-loose max-w-[340px]">
          ログイン後、利用者 / マッサージ師 / 管理者のいずれかのホーム画面に自動で振り分けられます。
        </p>

        <div className="lg:hidden text-center text-[11px] text-ink-faint">
          Ca-adv Tech Jam 社内システム
        </div>
      </div>
    </div>
  );
}
