import { requireRole } from "@/lib/dal";
import {
  rangeForPeriod,
  previousRangeForPeriod,
  formatRangeLabel,
  isValidISODate,
} from "@/lib/period";
import {
  getOverallStats,
  getTrendChartData,
  getShiftBreakdownTrend,
  getTherapistUtilization,
  getAllAttributeUtilization,
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
import { UtilizationTrendChart, AttributeTrendChart, ShiftBreakdownChart, TherapistBarList, AttributeBarSections } from "@/components/dashboard/charts";
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

function deltaText(current: number, previous: number, unit: string): { text: string; tone: "accent" | "faint" | "destructive" } {
  const diff = current - previous;
  if (diff === 0) return { text: `±0${unit} vs 前期間`, tone: "faint" };
  const sign = diff > 0 ? "+" : "";
  return { text: `${sign}${diff}${unit} vs 前期間`, tone: diff > 0 ? "accent" : "destructive" };
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const session = await requireRole("admin");
  const sp = await searchParams;

  const period = parsePeriod(sp.period);
  const refParam = firstSearchParam(sp.ref);
  const refDate = parseReferenceDate(refParam);
  const compare = parseCompare(sp.compare, true);
  const lineAttr = parseLineAttr(sp.lineAttr);
  const departments = await listDepartments();
  const lineValues = sanitizeLineValues(lineAttr, parseLineValues(sp.lineValues), departments);
  const filters = attributeFilterFromLineSelection(lineAttr, lineValues, departments);

  const range = rangeForPeriod(period, refDate);
  const previousRange = previousRangeForPeriod(period, refDate);

  const stats = await getOverallStats(range, filters);
  const previousStats = compare ? await getOverallStats(previousRange, filters) : null;
  const { trend, series: trendByAttribute } = await getTrendChartData({
    period,
    range,
    previousRange,
    lineAttr,
    lineValues,
    filters,
  });
  const shiftBreakdown = await getShiftBreakdownTrend(period, range);
  const therapists = await getTherapistUtilization(range, filters);
  const attributeBuckets = await getAllAttributeUtilization(range, filters);

  const params = {
    period: firstSearchParam(sp.period),
    ref: refParam && isValidISODate(refParam) ? refParam : undefined,
    compare: firstSearchParam(sp.compare),
    lineAttr: firstSearchParam(sp.lineAttr),
    lineValues: lineValues.length > 0 ? lineValues.join(",") : undefined,
  };
  const firstTherapistId = therapists[0]?.therapistId;

  const rateDelta = previousStats ? deltaText(stats.utilizationRate, previousStats.utilizationRate, "pt") : null;
  const countDelta = previousStats ? deltaText(stats.reservationCount, previousStats.reservationCount, "回") : null;
  const usersDelta = previousStats ? deltaText(stats.distinctUsers, previousStats.distinctUsers, "人") : null;
  const durationDelta = previousStats ? deltaText(stats.avgDurationMinutes, previousStats.avgDurationMinutes, "分") : null;

  return (
    <DashboardShell
      adminName={session.name}
      basePath="/dashboard"
      params={params}
      period={period}
      refDate={refDate}
      rangeLabel={formatRangeLabel(period, range)}
      compare={compare}
      lineAttrOptions={attributeTabOptions(ALL_ATTRIBUTES, lineAttr, ATTRIBUTE_LABEL, "lineAttr", "/dashboard", params, ["lineValues"])}
      lineValueOptions={valueCheckboxOptions(
        [{ value: OVERALL_ATTRIBUTE_VALUE, label: "全体" }, ...attributeValueOptions(lineAttr)],
        lineValues,
        "lineValues",
        "/dashboard",
        params
      )}
      scope="overall"
      scopeHrefs={{
        overall: withParams("/dashboard", params, {}),
        individual: firstTherapistId ? withParams(`/dashboard/${firstTherapistId}`, params, {}) : "/dashboard",
      }}
      subtitle={`本社ビル4F マッサージルーム`}
      filterNote="属性で絞り込み"
    >
      <div className="grid grid-cols-4 gap-3.5">
        <StatTile label="全体利用率（稼働時間/出勤時間）" value={stats.utilizationRate} unit="%" highlight delta={rateDelta?.text} deltaTone={rateDelta?.tone} />
        <StatTile label="今期間の利用回数" value={stats.reservationCount} unit="回" delta={countDelta?.text} deltaTone={countDelta?.tone} />
        <StatTile label="利用した社員数" value={stats.distinctUsers} unit="人" delta={usersDelta?.text} deltaTone={usersDelta?.tone} />
        <StatTile label="平均施術時間" value={stats.avgDurationMinutes} unit="分" delta={durationDelta?.text} deltaTone={durationDelta?.tone} />
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
          <h3 className="text-sm mb-0.5">施術者別 利用率</h3>
          <p className="mb-4.5 text-[11px] text-ink-faint">（稼働時間/出勤時間）</p>
          <TherapistBarList items={therapists} />
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
          <h3 className="text-sm mb-0.5">属性別 利用率</h3>
          <p className="mb-3.5 text-[11px] text-ink-faint">（利用人数／全利用者数）</p>
          <AttributeBarSections buckets={attributeBuckets} />
        </div>
      </div>
    </DashboardShell>
  );
}
