import { requireRole } from "@/lib/dal";
import {
  rangeForPeriod,
  previousRangeForPeriod,
  formatRangeLabel,
  todayISO,
  type PeriodType,
} from "@/lib/period";
import {
  getOverallStats,
  getUtilizationTrend,
  getUtilizationTrendByAttribute,
  getVacancyTrend,
  getTherapistUtilization,
  getAttributeUtilization,
  attributeValueOptions,
  overallAttributeSeries,
  OVERALL_ATTRIBUTE_VALUE,
  type AttributeKind,
} from "@/lib/dashboard-data";
import { sql } from "@/lib/db";
import { DashboardShell, AttributeTabs } from "@/components/dashboard/dashboard-shell";
import { StatTile } from "@/components/dashboard/stat-tile";
import { UtilizationTrendChart, AttributeTrendChart, VacancyChart, TherapistBarList, AttributeBarList } from "@/components/dashboard/charts";
import { withParams, valueCheckboxOptions, attributeTabOptions } from "@/lib/dashboard-url";

const ALL_ATTRIBUTES: AttributeKind[] = ["age", "gender", "department"];
const ATTRIBUTE_LABEL: Record<AttributeKind, string> = { age: "年代", gender: "性別", department: "部署" };

function parsePeriod(value: string | undefined): PeriodType {
  return value === "day" || value === "week" || value === "month" || value === "year" ? value : "week";
}

function parseAttribute(value: string | undefined): AttributeKind {
  return value === "age" || value === "gender" || value === "department" ? value : "department";
}

function parseLineAttr(value: string | undefined): AttributeKind {
  return value === "age" || value === "gender" || value === "department" ? value : "age";
}

function parseLineValues(value: string | undefined): string[] {
  return (value ?? "").split(",").filter(Boolean);
}

function deltaText(current: number, previous: number, unit: string): { text: string; tone: "accent" | "faint" | "destructive" } {
  const diff = current - previous;
  if (diff === 0) return { text: `±0${unit} vs 前期間`, tone: "faint" };
  const sign = diff > 0 ? "+" : "";
  return { text: `${sign}${diff}${unit} vs 前期間`, tone: diff > 0 ? "accent" : "destructive" };
}

const TREND_HEADING: Record<PeriodType, string> = {
  day: "時間帯別 利用率",
  week: "曜日別 利用率",
  month: "週別 利用率",
  year: "月別 利用率",
};

const VACANCY_UNIT = "単位：時間";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireRole("admin");
  const sp = await searchParams;

  const period = parsePeriod(sp.period);
  const refDate = sp.ref ?? todayISO();
  const compare = sp.compare !== "0";
  const attribute = parseAttribute(sp.attr);
  const lineAttr = parseLineAttr(sp.lineAttr);
  const lineValues = parseLineValues(sp.lineValues);
  const filters = { ageBracket: sp.age ?? "all", gender: sp.gender ?? "all", department: sp.dept ?? "all" };

  const range = rangeForPeriod(period, refDate);
  const previousRange = previousRangeForPeriod(period, refDate);

  const stats = await getOverallStats(range, filters);
  const previousStats = compare ? await getOverallStats(previousRange, filters) : null;
  const trend = lineValues.length === 0 ? await getUtilizationTrend(period, range, previousRange, filters) : null;
  const attributeKeys = lineValues.filter((v) => v !== OVERALL_ATTRIBUTE_VALUE);
  const trendByAttribute =
    lineValues.length > 0
      ? [
          ...(lineValues.includes(OVERALL_ATTRIBUTE_VALUE)
            ? [overallAttributeSeries(await getUtilizationTrend(period, range, previousRange, filters))]
            : []),
          ...(attributeKeys.length > 0
            ? await getUtilizationTrendByAttribute(period, range, lineAttr, filters, undefined, attributeKeys)
            : []),
        ]
      : [];
  const vacancy = await getVacancyTrend(period, range);
  const therapists = await getTherapistUtilization(range, filters);
  const attributeBuckets = await getAttributeUtilization(range, attribute, filters);

  const roster = await sql<{ gender: string }[]>`
    SELECT u.gender FROM therapist_profiles tp JOIN users u ON u.id = tp.user_id WHERE tp.is_active = true
  `;
  const maleCount = roster.filter((r) => r.gender === "male").length;
  const femaleCount = roster.filter((r) => r.gender === "female").length;

  const params = { period: sp.period, ref: sp.ref, compare: sp.compare, age: sp.age, gender: sp.gender, dept: sp.dept, attr: sp.attr, lineAttr: sp.lineAttr, lineValues: sp.lineValues };
  const firstTherapistId = therapists[0]?.therapistId;
  const isFiltered = filters.ageBracket !== "all" || filters.gender !== "all" || filters.department !== "all";
  const trendDescription =
    lineValues.length > 0
      ? "全体の利用率のうち、各属性が占める内訳です（合計すると全体利用率になります）"
      : isFiltered
        ? "絞り込み対象の社員のうち、利用した人数の割合の推移です"
        : "予約枠がどれくらい埋まっているか（稼働の割合）の推移です";

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
      subtitle={`全${roster.length}名のマッサージ師（男性${maleCount}・女性${femaleCount}）/ 第1〜第2マッサージ室`}
      filterNote="属性で絞り込み"
    >
      <div className="grid grid-cols-4 gap-3.5">
        <StatTile label="全体利用率" value={stats.utilizationRate} unit="%" highlight delta={rateDelta?.text} deltaTone={rateDelta?.tone} />
        <StatTile label={`${period === "day" ? "本日" : "今期間"}の利用回数`} value={stats.reservationCount} unit="回" delta={countDelta?.text} deltaTone={countDelta?.tone} />
        <StatTile label="利用した社員数" value={stats.distinctUsers} unit="人" delta={usersDelta?.text} deltaTone={usersDelta?.tone} />
        <StatTile label="平均施術時間" value={stats.avgDurationMinutes} unit="分" delta={durationDelta?.text} deltaTone={durationDelta?.tone} />
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <div className="bg-surface border border-border rounded-2xl px-6 py-5.5 flex flex-col">
          <h3 className="text-sm mb-0.5">{TREND_HEADING[period]}</h3>
          <p className="mt-0.5 mb-4 text-[11px] text-ink-faint">{trendDescription}</p>
          {trend ? (
            <UtilizationTrendChart points={trend} showPrevious={compare} />
          ) : (
            <AttributeTrendChart series={trendByAttribute} />
          )}
        </div>

        <div className="bg-surface border border-border rounded-2xl px-6 py-5.5 flex flex-col">
          <h3 className="text-sm mb-0.5">施術者別 利用率</h3>
          <p className="mb-4.5 text-[11px] text-ink-faint">偏りの是正状況を確認できます</p>
          <TherapistBarList items={therapists} />
        </div>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <div className="bg-surface border border-border rounded-2xl px-6 py-5.5 flex flex-col">
          <div className="flex items-baseline justify-between mb-0.5">
            <h3 className="text-sm">{TREND_HEADING[period].replace("利用率", "空き時間")}</h3>
            <span className="text-[11px] text-ink-faint">{VACANCY_UNIT}</span>
          </div>
          <p className="mt-0.5 mb-4 text-[11px] text-ink-faint">利用率と同じ軸で、空いている時間を確認できます</p>
          <VacancyChart points={vacancy} />
        </div>

        <div className="bg-surface border border-border rounded-2xl px-6 py-5.5 flex flex-col">
          <div className="flex items-center justify-between mb-3.5">
            <h3 className="text-sm">属性別 利用率</h3>
            <AttributeTabs options={attributeTabOptions(ALL_ATTRIBUTES, attribute, ATTRIBUTE_LABEL, "attr", "/dashboard", params)} />
          </div>
          <AttributeBarList items={attributeBuckets} />
        </div>
      </div>
    </DashboardShell>
  );
}
