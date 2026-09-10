import Image from "next/image";
import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import type { Role } from "@/lib/session";

const NAV_ITEMS: Record<Role, { href: string; label: string; icon: "calendar" | "chart" }[]> = {
  user: [{ href: "/booking", label: "予約", icon: "calendar" }],
  therapist: [{ href: "/schedule", label: "スケジュール", icon: "calendar" }],
  admin: [{ href: "/dashboard", label: "利用率ダッシュボード", icon: "chart" }],
};

const ACTIVE_CLASSES: Record<Role, string> = {
  user: "bg-role-user-soft text-role-user",
  therapist: "bg-role-therapist-soft text-role-therapist",
  admin: "bg-role-admin-soft text-role-admin",
};

export function AppSidebar({ role, name, activePath }: { role: Role; name: string; activePath: string }) {
  const roleLabel = role === "user" ? "利用者" : role === "therapist" ? "マッサージ師" : "施設管理担当";

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-surface py-6">
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
              {item.icon === "chart" ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 3v18h18M7 15l4-4 3 3 5-6" /></svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              )}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="grow" />
      <div className="border-t border-border px-3 pt-4">
        <AccountMenu
          name={name}
          roleLabel={roleLabel}
          menuPlacement="up"
          avatarClassName={ACTIVE_CLASSES[role]}
        />
      </div>
    </aside>
  );
}
