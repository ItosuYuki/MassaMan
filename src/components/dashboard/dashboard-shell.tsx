import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { shiftReference, type PeriodType } from "@/lib/period";
import { withParams } from "@/lib/dashboard-url";
import { AttributeCheckboxes } from "@/components/dashboard/attribute-checkboxes";
import { logout } from "@/app/actions/auth";

const PERIODS: { value: PeriodType; label: string }[] = [
  { value: "day", label: "日" },
  { value: "week", label: "週" },
  { value: "month", label: "月" },
  { value: "year", label: "年" },
];

export function DashboardShell({
  adminName,
  basePath,
  params,
  period,
  refDate,
  rangeLabel,
  compare,
  lineAttrOptions,
  lineValueOptions,
  scope,
  scopeHrefs,
  subtitle,
  filterNote,
  children,
}: {
  adminName: string;
  basePath: string;
  params: Record<string, string | undefined>;
  period: PeriodType;
  refDate: string;
  rangeLabel: string;
  compare: boolean;
  /** Dimension tab (年代/性別/部署, exclusive) for the trend-chart breakdown. */
  lineAttrOptions: { value: string; label: string; active: boolean; href: string }[];
  /** Checkboxes for the values (e.g. 20代/30代) within the active `lineAttrOptions`
   * dimension — which per-value lines actually get drawn on the trend chart. */
  lineValueOptions: { value: string; label: string; checked: boolean; href: string }[];
  scope: "overall" | "individual";
  scopeHrefs: { overall: string; individual: string };
  subtitle: string;
  filterNote: string;
  children: ReactNode;
}) {
  const hrefFor = (changes: Record<string, string>) => withParams(basePath, params, changes);

  return (
    <div className="min-h-dvh flex bg-bg">
      {/* Sidebar */}
      <div className="w-[220px] shrink-0 bg-surface border-r border-border flex flex-col py-6">
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
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13px] font-medium bg-role-admin-soft text-role-admin">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />
            </svg>
            利用率ダッシュボード
          </div>
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
      </div>

      {/* Main column */}
      <div className="grow flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-border bg-surface shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl">マッサージ室 利用率ダッシュボード</h1>
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-role-admin-soft text-role-admin">
                サンプルデータ
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-faint">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex bg-bg rounded-[9px] p-[3px]">
              {PERIODS.map((p) => (
                <Link
                  key={p.value}
                  href={hrefFor({ period: p.value })}
                  className={`px-3.5 py-1.5 rounded-lg text-xs ${
                    p.value === period ? "bg-surface text-ink font-medium shadow-sm" : "text-ink-faint"
                  }`}
                >
                  {p.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 bg-surface-2 border border-border rounded-[10px] px-3.5 py-2 text-[13px] text-ink-soft w-[210px] shrink-0">
              <Link href={hrefFor({ ref: shiftReference(period, refDate, -1) })} aria-label="前の期間" className="shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4C5C6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </Link>
              <span className="mono truncate">{rangeLabel}</span>
              <Link href={hrefFor({ ref: shiftReference(period, refDate, 1) })} aria-label="次の期間" className="shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4C5C6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        <div className="grow px-8 py-5 flex flex-col gap-4 overflow-y-auto">
          {/* Filter row */}
          <div className="bg-surface border border-border rounded-2xl px-4.5 py-3 flex items-center gap-4.5">
            <div className="flex items-center gap-4.5 flex-wrap min-w-0">
              <Link href={hrefFor({ compare: compare ? "0" : "1" })} className="flex items-center gap-2 shrink-0">
                <span
                  className={`w-9 h-[21px] rounded-full relative shrink-0 ${compare ? "bg-accent" : "bg-surface-2 border border-border"}`}
                >
                  <span
                    className={`absolute top-0.5 w-[17px] h-[17px] rounded-full bg-white shadow ${compare ? "left-[17px]" : "left-0.5"}`}
                  />
                </span>
                <span className="text-xs text-ink">前期間と比較</span>
              </Link>
              <div className="w-px h-5 bg-border shrink-0" />
              <span className="text-[11px] text-ink-faint shrink-0">{filterNote}</span>
              <AttributeTabs options={lineAttrOptions} />
              <AttributeCheckboxes options={lineValueOptions} />
            </div>
            <div className="grow" />
            <div className="flex bg-bg rounded-[11px] p-[3px] shrink-0">
              <Link
                href={scopeHrefs.overall}
                className={`px-4.5 py-2 rounded-[9px] text-[13px] ${
                  scope === "overall" ? "bg-role-admin text-white font-medium" : "text-ink-faint"
                }`}
              >
                全体
              </Link>
              <Link
                href={scopeHrefs.individual}
                className={`px-4.5 py-2 rounded-[9px] text-[13px] ${
                  scope === "individual" ? "bg-role-admin text-white font-medium" : "text-ink-faint"
                }`}
              >
                施術者個人
              </Link>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

/** Single-select tabs (年代/性別/部署) for the bar-chart attribute breakdown
 * panels — distinct from AttributeCheckboxes, which drives the multi-line
 * trend-chart breakdown and allows more than one at a time. */
export function AttributeTabs({ options }: { options: { value: string; label: string; active: boolean; href: string }[] }) {
  return (
    <div className="flex bg-bg rounded-lg p-[3px]">
      {options.map((o) => (
        <Link
          key={o.value}
          href={o.href}
          className={`px-3 py-1.5 rounded-2xl text-[11px] ${
            o.active ? "bg-accent-soft text-accent-strong font-medium" : "text-ink-faint"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
