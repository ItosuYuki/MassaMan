import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { rangeForPeriod, previousRangeForPeriod, formatRangeLabel, todayISO, type PeriodType } from "@/lib/period";
import {
  getTherapistSummary,
  getUtilizationTrend,
  getUtilizationTrendByAttribute,
  getVacancyTrend,
  getClientAttributeShare,
  listTherapists,
  attributeValueOptions,
  overallAttributeSeries,
  OVERALL_ATTRIBUTE_VALUE,
  type AttributeKind,
} from "@/lib/dashboard-data";
import { DashboardShell, AttributeTabs } from "@/components/dashboard/dashboard-shell";
import { StatTile } from "@/components/dashboard/stat-tile";
import { UtilizationTrendChart, AttributeTrendChart, VacancyChart, AttributeBarGrid } from "@/components/dashboard/charts";
import { FilterSelect } from "@/components/dashboard/filter-select";
import { withParams, valueCheckboxOptions, attributeTabOptions } from "@/lib/dashboard-url";

const ALL_ATTRIBUTES: AttributeKind[] = ["age", "gender", "department"];
const ATTRIBUTE_LABEL: Record<AttributeKind, string> = { age: "年代", gender: "性別", department: "部署" };

function parsePeriod(value: string | undefined): PeriodType {
  return value === "day" || value === "week" || value === "month" || value === "year" ? value : "week";
}

function parseAttribute(value: string | undefined): AttributeKind {
  return value === "age" || value === "gender" || value === "department" ? value : "age";
}

function parseLineAttr(value: string | undefined): AttributeKind {
  return value === "age" || value === "gender" || value === "department" ? value : "age";
}

function parseLineValues(value: string | undefined): string[] {
  return (value ?? "").split(",").filter(Boolean);
}

const TREND_HEADING: Record<PeriodType, string> = {
  day: "時間帯別 利用率",
  week: "曜日別 利用率",
  month: "週別 利用率",
  year: "月別 利用率",
};

export default async function TherapistDashboardPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ therapistId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireRole("admin");
  const { therapistId } = await routeParams;
  const sp = await searchParams;

  const therapists = await listTherapists();
  if (!therapists.some((t) => t.therapistId === therapistId)) {
    notFound();
  }

  const period = parsePeriod(sp.period);
  const refDate = sp.ref ?? todayISO();
  const compare = sp.compare === "1";
  const attribute = parseAttribute(sp.attr);
  const lineAttr = parseLineAttr(sp.lineAttr);
  const lineValues = parseLineValues(sp.lineValues);
  const filters = { ageBracket: sp.age ?? "all", gender: sp.gender ?? "all", department: sp.dept ?? "all" };

  const range = rangeForPeriod(period, refDate);
  const previousRange = previousRangeForPeriod(period, refDate);
  const summary = await getTherapistSummary(therapistId, range, filters);
  const trend =
    lineValues.length === 0 ? await getUtilizationTrend(period, range, previousRange, filters, therapistId) : null;
  const attributeKeys = lineValues.filter((v) => v !== OVERALL_ATTRIBUTE_VALUE);
  const trendByAttribute =
    lineValues.length > 0
      ? [
          ...(lineValues.includes(OVERALL_ATTRIBUTE_VALUE)
            ? [overallAttributeSeries(await getUtilizationTrend(period, range, previousRange, filters, therapistId))]
            : []),
          ...(attributeKeys.length > 0
            ? await getUtilizationTrendByAttribute(period, range, previousRange, lineAttr, filters, therapistId, attributeKeys)
            : []),
        ]
      : [];
  const vacancy = await getVacancyTrend(period, range, therapistId);
  const attributeBuckets = await getClientAttributeShare(range, attribute, therapistId);

  const params = { period: sp.period, ref: sp.ref, compare: sp.compare, age: sp.age, gender: sp.gender, dept: sp.dept, attr: sp.attr, lineAttr: sp.lineAttr, lineValues: sp.lineValues };
  const basePath = `/dashboard/${therapistId}`;
  const initial = summary.name.trim().split(" ").pop()?.slice(0, 1) ?? "?";
  const isFiltered = filters.ageBracket !== "all" || filters.gender !== "all" || filters.department !== "all";
  const trendDescription =
    lineValues.length > 0
      ? "全体の利用率のうち、各属性が占める内訳です（合計すると全体利用率になります）"
      : isFiltered
        ? "絞り込み対象の利用者のうち、利用した人数の割合の推移です"
        : "予約枠がどれくらい埋まっているか（稼働の割合）の推移です";

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
      subtitle="施術者個人ビュー"
      filterNote="属性で絞り込み（このマッサージ師の利用者について）"
    >
      <div className="bg-surface border border-border rounded-2xl px-4.5 py-3.5 flex items-center gap-3.5">
        <div className="w-9 h-9 rounded-full bg-role-therapist-soft flex items-center justify-center font-heading text-accent-strong text-[15px] shrink-0">
          {initial}
        </div>
        <div className="grow">
          <div className="text-sm font-medium">{summary.name}</div>
          <div className="text-[11px] text-ink-faint">{summary.specialties ?? "―"}</div>
        </div>
        <FilterSelect
          label="担当を変更"
          value={therapistId}
          options={therapists.map((t) => ({
            value: t.therapistId,
            label: t.name,
            href: withParams(`/dashboard/${t.therapistId}`, params, {}),
          }))}
        />
      </div>

      <div className="grid grid-cols-4 gap-3.5">
        <StatTile
          label="個人利用率"
          value={summary.personalRate}
          unit="%"
          highlight
          delta={`全体平均 ${summary.overallAvgRate}%`}
        />
        <StatTile label="今期間の施術件数" value={summary.reservationCount} unit="件" />
        <StatTile label="リピーター利用者数" value={summary.repeaterCount} unit="人" />
        <StatTile label="平均施術時間" value={summary.avgDurationMinutes} unit="分" />
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <div className="bg-surface border border-border rounded-2xl px-6 py-5.5 flex flex-col">
          <h3 className="text-sm mb-0.5">{TREND_HEADING[period]}</h3>
          <p className="mt-0.5 mb-4 text-[11px] text-ink-faint">{trendDescription}</p>
          {trend ? (
            <UtilizationTrendChart points={trend} showPrevious={compare} />
          ) : (
            <AttributeTrendChart series={trendByAttribute} showPrevious={compare} />
          )}
        </div>

        <div className="bg-surface border border-border rounded-2xl px-6 py-5.5 flex flex-col">
          <div className="flex items-baseline justify-between mb-0.5">
            <h3 className="text-sm">{TREND_HEADING[period].replace("利用率", "空き時間")}</h3>
            <span className="text-[10px] text-ink-faint">単位：時間</span>
          </div>
          <p className="mt-0.5 mb-4 text-[11px] text-ink-faint">利用率と同じ軸で、空いている時間を確認できます</p>
          <VacancyChart points={vacancy} />
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl px-6 py-5.5 flex flex-col">
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="text-sm">{summary.name} の利用者属性</h3>
          <AttributeTabs options={attributeTabOptions(ALL_ATTRIBUTES, attribute, ATTRIBUTE_LABEL, "attr", basePath, params)} />
        </div>
        <AttributeBarGrid items={attributeBuckets} />
      </div>
    </DashboardShell>
  );
}
