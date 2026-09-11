import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import type { Role } from "@/lib/session";

const NAV_ITEMS: Record<Role, { href: string; label: string; icon: "calendar" | "chart" | "users" | "clock" | "person" }[]> = {
  user: [
    { href: "/booking", label: "予約", icon: "calendar" },
    { href: "/history", label: "履歴", icon: "clock" },
    { href: "/mypage", label: "マイページ", icon: "person" },
  ],
  therapist: [{ href: "/schedule", label: "スケジュール", icon: "calendar" }],
  admin: [
    { href: "/dashboard", label: "利用率ダッシュボード", icon: "chart" },
    { href: "/therapists", label: "マッサージ師管理", icon: "users" },
  ],
};

const ACTIVE_CLASSES: Record<Role, string> = {
  user: "bg-role-user-soft text-role-user",
  therapist: "bg-role-therapist-soft text-role-therapist",
  admin: "bg-role-admin-soft text-role-admin",
};

type NavIconName = (typeof NAV_ITEMS)[Role][number]["icon"];

function NavIcon({ icon }: { icon: NavIconName }) {
  if (icon === "chart") {
    return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 3v18h18M7 15l4-4 3 3 5-6" /></svg>;
  }
  if (icon === "users") {
    return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3 2-5 4-5h8c2 0 4 2 4 5" /></svg>;
  }
  if (icon === "clock") {
    return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>;
  }
  if (icon === "person") {
    return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></svg>;
  }
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
}

export function AppSidebar({ role, name, activePath }: { role: Role; name: string; activePath: string }) {
  const roleLabel = role === "user" ? "利用者" : role === "therapist" ? "マッサージ師" : "施設管理担当";
  const initial = name.trim().charAt(0) || "?";

  return (
    <>
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border bg-surface py-6 sm:flex">
        <Link href={role === "admin" ? "/dashboard" : role === "user" ? "/booking" : "/schedule"} className="mb-4 flex items-center gap-2.5 border-b border-border px-5 pb-5">
          <Image src="/icon.png" alt="マッサマン" width={30} height={30} className="h-[30px] w-[30px] rounded-[9px] object-cover" />
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-black tracking-tight">マッサマン</span>
            <span className="font-heading text-[10px] text-ink-faint">Massage Manager</span>
          </span>
        </Link>

        <nav aria-label="メインナビゲーション" className="flex flex-col gap-0.5 px-3">
          {NAV_ITEMS[role].map((item) => {
            const active = activePath === item.href || activePath.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13px] ${active ? `${ACTIVE_CLASSES[role]} font-medium` : "text-ink-soft hover:bg-bg"}`}>
                <NavIcon icon={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="grow" />
        <div className="border-t border-border px-5 pt-4 flex items-center gap-2.5">
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${ACTIVE_CLASSES[role]}`}>
            {initial}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs">{name}</div>
            <div className="text-[10px] text-ink-faint">{roleLabel}</div>
          </div>
        </div>
        <form action={logout} className="px-5 pt-3">
          <button type="submit" className="text-[11px] text-destructive">
            ログアウト
          </button>
        </form>
      </aside>

      {role === "user" ? (
        <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
          <nav aria-label="モバイルナビゲーション" className="grid h-16 grid-cols-3">
            {NAV_ITEMS.user.map((item) => {
              const active = activePath === item.href || activePath.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={`flex flex-col items-center justify-center gap-1 text-[11px] ${active ? "font-medium text-role-user" : "text-ink-faint"}`}>
                  <NavIcon icon={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </footer>
      ) : (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg px-6 py-8 sm:hidden">
          <div className="flex items-center gap-2.5">
            <Image src="/icon.png" alt="マッサマン" width={36} height={36} className="h-9 w-9 rounded-[10px] object-cover" />
            <span className="text-sm font-black">マッサマン</span>
          </div>
          <main className="m-auto max-w-sm text-center">
            <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${ACTIVE_CLASSES[role]}`}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M10 18h4M3 3l18 18" /></svg>
            </div>
            <p className="mb-2 text-xs font-medium text-ink-faint">{roleLabel}画面</p>
            <h1 className="text-xl font-bold leading-relaxed">スマートフォンでは表示できません</h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-faint">PCからアクセスしてご利用ください。</p>
          </main>
          <form action={logout} className="text-center">
            <button type="submit" className="text-xs text-destructive">ログアウト</button>
          </form>
        </div>
      )}
    </>
  );
}
