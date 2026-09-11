import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { rangeForPeriod, previousRangeForPeriod, formatRangeLabel, isValidISODate } from "@/lib/period";
import {
  getTherapistSummary,
  getTrendChartData,
  getShiftBreakdownTrend,
  getAllClientAttributeShare,
  listTherapists,
  attributeValueOptions,
  attributeFilterFromLineSelection,
  listDepartments,
  ALL_ATTRIBUTES,
  ATTRIBUTE_LABEL,
  OVERALL_ATTRIBUTE_VALUE,
  sanitizeLineValues,
} from "@/lib/dashboard-data";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { StatTile } from "@/components/dashboard/stat-tile";
import { UtilizationTrendChart, AttributeTrendChart, ShiftBreakdownChart, AttributeBarSections } from "@/components/dashboard/charts";
import { FilterSelect } from "@/components/dashboard/filter-select";
import { withParams, valueCheckboxOptions, attributeTabOptions } from "@/lib/dashboard-url";
import {
  firstSearchParam,
  parseCompare,
  parseLineAttr,
  parseLineValues,
  parsePeriod,
  parseReferenceDate,
  SHIFT_BREAKDOWN_UNIT,
  TREND_HEADING,
  trendDescription,
  type SearchParamValue,
} from "@/lib/dashboard-params";

export default async function TherapistDashboardPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ therapistId: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const session = await requireRole("admin");
  const { therapistId } = await routeParams;
  const sp = await searchParams;

  const therapists = await listTherapists();
  if (!therapists.some((t) => t.therapistId === therapistId)) {
    notFound();
  }

  const period = parsePeriod(sp.period);
  const refParam = firstSearchParam(sp.ref);
  const refDate = parseReferenceDate(refParam);
  const compare = parseCompare(sp.compare);
  const lineAttr = parseLineAttr(sp.lineAttr);
  const departments = await listDepartments();
  const lineValues = sanitizeLineValues(lineAttr, parseLineValues(sp.lineValues), departments);
  const filters = attributeFilterFromLineSelection(lineAttr, lineValues, departments);

  const range = rangeForPeriod(period, refDate);
  const previousRange = previousRangeForPeriod(period, refDate);
  const summary = await getTherapistSummary(therapistId, range, filters);
  const { trend, series: trendByAttribute } = await getTrendChartData({
    period,
    range,
    previousRange,
    lineAttr,
    lineValues,
    filters,
    therapistId,
  });
  const shiftBreakdown = await getShiftBreakdownTrend(period, range, therapistId);
  const attributeBuckets = await getAllClientAttributeShare(range, therapistId, filters);

  const params = {
    period: firstSearchParam(sp.period),
    ref: refParam && isValidISODate(refParam) ? refParam : undefined,
    compare: firstSearchParam(sp.compare),
    lineAttr: firstSearchParam(sp.lineAttr),
    lineValues: lineValues.length > 0 ? lineValues.join(",") : undefined,
  };
  const basePath = `/dashboard/${therapistId}`;
  const initial = summary.name.trim().split(" ").pop()?.slice(0, 1) ?? "?";

  return (
    <DashboardShell
      adminName={session.name}
      basePath={basePath}
      params={params}
      period={period}
      refDate={refDate}
      rangeLabel={formatRangeLabel(period, range)}
      compare={compare}
      lineAttrOptions={attributeTabOptions(ALL_ATTRIBUTES, lineAttr, ATTRIBUTE_LABEL, "lineAttr", basePath, params, ["lineValues"])}
      lineValueOptions={valueCheckboxOptions(
        [{ value: OVERALL_ATTRIBUTE_VALUE, label: "全体" }, ...attributeValueOptions(lineAttr)],
        lineValues,
        "lineValues",
        basePath,
        params
      )}
      scope="individual"
      scopeHrefs={{
        overall: withParams("/dashboard", params, {}),
        individual: withParams(basePath, params, {}),
      }}
      subtitle="本社ビル4F マッサージルーム"
      filterNote="属性で絞り込み"
    >
      <div className="grid grid-cols-4 gap-3.5">
        <StatTile
          label="個人利用率（稼働時間／出勤時間）"
          value={summary.personalRate}
          unit="%"
          highlight
          delta={`全体平均 ${summary.overallAvgRate}%`}
        />
        <StatTile label="今期間の利用回数" value={summary.reservationCount} unit="件" />
        <StatTile label="利用した社員数" value={summary.distinctUsers} unit="人" />
        <StatTile label="平均施術時間" value={summary.avgDurationMinutes} unit="分" />
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <div className="bg-surface border border-border rounded-2xl px-6 py-5.5 flex flex-col">
          <h3 className="text-sm mb-0.5">{TREND_HEADING[period]}</h3>
          <p className="mt-0.5 mb-4 text-[11px] text-ink-faint">{trendDescription(lineValues)}</p>
          {trend ? (
            <UtilizationTrendChart points={trend} showPrevious={compare} />
          ) : (
            <AttributeTrendChart series={trendByAttribute} showPrevious={compare} />
          )}
        </div>

        <div className="bg-surface border border-border rounded-2xl px-6 py-5.5 flex flex-col">
          <h3 className="text-sm mb-3.5">施術者情報</h3>
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-[84px] h-[84px] rounded-full bg-role-therapist-soft flex items-center justify-center font-heading text-accent-strong text-[30px] shrink-0">
              {initial}
            </div>
            <div>
              <div className="text-base font-medium">{summary.name}</div>
              <div className="mt-1 text-[11px] text-ink-faint">{summary.bio ?? "―"}</div>
            </div>
            {summary.specialties.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {summary.specialties.map((s) => (
                  <span key={s} className="px-2.5 py-1 rounded-full bg-surface-2 text-[11px] text-ink-soft">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="h-px bg-border my-4" />
          <div className="flex items-center justify-between text-xs mb-3">
            <span className="text-ink-faint">担当する部屋</span>
            <span className="text-ink">{summary.roomName ?? "―"}</span>
          </div>
          <FilterSelect
            label="担当を変更"
            value={therapistId}
            options={therapists.map((t) => ({
              value: t.therapistId,
              label: t.name,
              href: withParams(`/dashboard/${t.therapistId}`, params, {}),
            }))}
            className="w-full justify-between"
          />
        </div>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <div className="bg-surface border border-border rounded-2xl px-6 py-5.5 flex flex-col">
          <div className="flex items-baseline justify-between mb-0.5">
            <h3 className="text-sm">{TREND_HEADING[period].replace("利用率", "稼働内訳")}</h3>
            <span className="text-[11px] text-ink-faint">{SHIFT_BREAKDOWN_UNIT}</span>
          </div>
          <p className="mt-0.5 mb-4 text-[11px] text-ink-faint">出勤時間のうち、施術に使われた時間と空いていた時間の内訳です</p>
          <ShiftBreakdownChart points={shiftBreakdown} />
        </div>

        <div className="bg-surface border border-border rounded-2xl px-6 py-5.5 flex flex-col">
          <h3 className="text-sm mb-0.5">属性別 利用率（利用人数／全利用者数）</h3>
          <p className="mb-3.5 text-[11px] text-ink-faint">利用した社員の人数に占める割合です</p>
          <AttributeBarSections buckets={attributeBuckets} />
        </div>
      </div>
    </DashboardShell>
  );
}
