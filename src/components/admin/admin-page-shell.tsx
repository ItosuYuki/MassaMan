import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

type AdminSection = "dashboard" | "therapists";

export function AdminPageShell({
  adminName,
  active,
  title,
  subtitle,
  headerActions,
  contentClassName,
  children,
}: {
  adminName: string;
  active: AdminSection;
  title: string;
  subtitle: string;
  headerActions?: ReactNode;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="h-dvh overflow-hidden bg-bg">
      <AdminSidebar adminName={adminName} active={active} />

      <div className="ml-[220px] h-dvh min-w-0 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-4 px-8 py-5 border-b border-border bg-surface shrink-0">
          <div className="min-w-0">
            <h1 className="text-xl">{title}</h1>
            <p className="mt-1 text-xs text-ink-faint">{subtitle}</p>
          </div>
          {headerActions && <div className="shrink-0">{headerActions}</div>}
        </header>

        <main className={cn("grow min-w-0 overflow-y-auto px-8 py-5", contentClassName)}>{children}</main>
      </div>
    </div>
  );
}

export function AdminSidebar({
  adminName,
  active,
}: {
  adminName: string;
  active: AdminSection;
}) {
  const itemClass = (isActive: boolean) =>
    `flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13px] ${
      isActive ? "font-medium bg-role-admin-soft text-role-admin" : "text-ink-soft"
    }`;

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex h-dvh w-[220px] flex-col overflow-y-auto border-r border-border bg-surface py-6">
      <div className="flex items-center gap-2.5 px-5 pb-5 border-b border-border mb-4">
        <div className="w-[30px] h-[30px] rounded-[9px] overflow-hidden shrink-0">
          <Image src="/icon.png" alt="マッサマン" width={30} height={30} className="w-full h-full object-cover" />
        </div>
        <span className="flex flex-col leading-tight">
          <span className="font-sans font-[900] text-sm tracking-[-0.02em] text-ink">マッサマン</span>
          <span className="font-heading text-[10px] text-ink-faint">Massage Manager</span>
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        <Link href="/dashboard" className={itemClass(active === "dashboard")}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />
          </svg>
          利用率ダッシュボード
        </Link>
        <Link href="/therapists" className={itemClass(active === "therapists")}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-3 2-5 4-5h8c2 0 4 2 4 5" />
          </svg>
          マッサージ師管理
        </Link>
      </nav>

      <div className="grow" />

      <div className="px-5 pt-4 border-t border-border flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-role-admin-soft flex items-center justify-center text-xs text-role-admin font-medium shrink-0">
          管
        </div>
        <div className="min-w-0">
          <div className="text-xs truncate">{adminName}</div>
          <div className="text-[10px] text-ink-faint">施設管理担当</div>
        </div>
      </div>
      <form action={logout} className="px-5 pt-3">
        <button type="submit" className="text-[11px] text-destructive">
          ログアウト
        </button>
      </form>
    </aside>
  );
}
