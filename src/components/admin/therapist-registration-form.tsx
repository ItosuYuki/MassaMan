"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createTherapist, type TherapistFormState } from "@/app/actions/therapists";

export function TherapistRegistrationForm({ rooms }: { rooms: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<TherapistFormState, FormData>(createTherapist, undefined);

  return (
    <form action={formAction} className="max-w-[760px] rounded-2xl border border-border bg-surface p-6 flex flex-col gap-5">
      <div>
        <h2 className="text-base">アカウント情報</h2>
        <p className="mt-1 text-xs text-ink-faint">登録した社員番号と初期パスワードでマッサージ師がログインできます。</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-soft">社員番号 <span className="text-destructive">*</span></span>
          <input name="employeeCode" required maxLength={50} className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-soft">氏名 <span className="text-destructive">*</span></span>
          <input name="name" required maxLength={100} className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-soft">初期パスワード <span className="text-destructive">*</span></span>
          <input name="password" type="password" autoComplete="new-password" minLength={8} required className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
          <span className="text-[11px] text-ink-faint">8文字以上</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-soft">担当する部屋</span>
          <select name="roomId" defaultValue="" className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
            <option value="">未定</option>
            {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
        </label>
      </div>

      <div className="h-px bg-border" />

      <div>
        <h2 className="text-base">プロフィール情報</h2>
        <p className="mt-1 text-xs text-ink-faint">利用率の属性集計と、管理画面のプロフィール表示に使用します。</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-soft">性別</span>
          <select name="gender" defaultValue="unspecified" className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
            <option value="unspecified">未設定</option>
            <option value="male">男性</option>
            <option value="female">女性</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-soft">年代</span>
          <select name="ageBracket" defaultValue="30s" className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
            <option value="20s">20代</option>
            <option value="30s">30代</option>
            <option value="40s">40代</option>
            <option value="50s_plus">50代以上</option>
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1.5">
          <span className="text-xs text-ink-soft">得意分野</span>
          <input name="specialties" placeholder="肩こり、腰痛" className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
          <span className="text-[11px] text-ink-faint">複数ある場合は「、」またはカンマで区切ってください。</span>
        </label>
        <label className="col-span-2 flex flex-col gap-1.5">
          <span className="text-xs text-ink-soft">経歴・紹介文</span>
          <textarea name="bio" rows={4} className="resize-y rounded-[10px] border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent" />
        </label>
      </div>

      {state?.error && <p className="text-xs text-destructive" role="alert">{state.error}</p>}

      <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
        <Link href="/therapists" className="rounded-[10px] border border-border px-4 py-2.5 text-xs text-ink-soft">キャンセル</Link>
        <button type="submit" disabled={pending} className="rounded-[10px] bg-role-admin px-5 py-2.5 text-xs font-medium text-white disabled:opacity-60">
          {pending ? "登録中…" : "マッサージ師を登録"}
        </button>
      </div>
    </form>
  );
}
