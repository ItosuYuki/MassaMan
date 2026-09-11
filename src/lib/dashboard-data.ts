import "server-only";
import { sql } from "@/lib/db";
import { trendBuckets, HOURS, type DateRange, type PeriodType, type TrendBucket } from "@/lib/period";
import {
  type AttributeKind,
  type AttributeFilter,
  ALL_ATTRIBUTES,
  ATTRIBUTE_LABEL,
  DEFAULT_FILTER,
  OVERALL_ATTRIBUTE_VALUE,
  attributeFilterFromLineSelection,
  sanitizeLineValues,
} from "@/lib/attribute-filter";

export { HOURS };
export {
  type AttributeKind,
  type AttributeFilter,
  ALL_ATTRIBUTES,
  ATTRIBUTE_LABEL,
  DEFAULT_FILTER,
  OVERALL_ATTRIBUTE_VALUE,
  attributeFilterFromLineSelection,
  sanitizeLineValues,
};

type ShiftRow = { therapist_id: string; work_date: string; start_time: string; end_time: string };
type ReservationRow = {
  therapist_id: string;
  user_id: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  age_bracket: string | null;
  gender: string;
  department_name: string | null;
};

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

/** Every reservation blocks the room for 15 extra minutes of cleanup/prep after
 * the recorded treatment time (see design/therapist-schedule-mobile.html:
 * "施術は最大45分・片付け15分を含みます"). The stored end_time only covers the
 * ~1〜45分 treatment itself, so every place that sums a reservation's occupied
 * minutes needs to add this on top — shifts (therapist_shifts) aren't
 * reservations and don't get it. */
const CLEANUP_BUFFER_MINUTES = 15;

function reservationMinutes(r: { start_time: string; end_time: string }): number {
  return minutesBetween(r.start_time, r.end_time) + CLEANUP_BUFFER_MINUTES;
}

function hourOf(time: string): number {
  return Number(time.split(":")[0]);
}

async function fetchShifts(range: DateRange, therapistId?: string): Promise<ShiftRow[]> {
  const therapistClause = therapistId ? sql`AND therapist_id = ${therapistId}` : sql``;
  return sql<ShiftRow[]>`
    SELECT therapist_id, work_date, start_time, LEAST(end_time, TIME '20:00') AS end_time
    FROM therapist_shifts
    WHERE work_date BETWEEN ${range.start} AND ${range.end}
      AND start_time < TIME '20:00'
      ${therapistClause}
  `;
}

/** WHERE-clause fragment for the age/gender/department filters, shared by
 * reservation and headcount queries so the two stay in sync (§ the "全体をその属性
 * 全体で考える" rule: narrowing the numerator must narrow the denominator to match).
 * Each dimension is an OR of 1+ values (`= ANY(...)`) rather than a single
 * equality, since the checkbox UI allows checking more than one value within
 * a dimension (e.g. 20代 and 30代 both). */
function attributeWhere(filters: AttributeFilter, extra?: { attribute: AttributeKind; value: string }) {
  const age = extra?.attribute === "age" ? [extra.value] : filters.ageBracket;
  const gender = extra?.attribute === "gender" ? [extra.value] : filters.gender;
  const department = extra?.attribute === "department" ? [extra.value] : filters.department;

  return sql`
    ${age.length > 0 ? sql`AND u.age_bracket = ANY(${age}::age_bracket[])` : sql``}
    ${gender.length > 0 ? sql`AND u.gender = ANY(${gender}::gender[])` : sql``}
    ${department.length > 0 ? sql`AND d.name = ANY(${department}::text[])` : sql``}
  `;
}

async function fetchReservations(
  range: DateRange,
  filters: AttributeFilter,
  therapistId?: string
): Promise<ReservationRow[]> {
  const therapistClause = therapistId ? sql`AND r.therapist_id = ${therapistId}` : sql``;
  const attrClause = attributeWhere(filters);

  return sql<ReservationRow[]>`
    SELECT r.therapist_id, r.user_id, r.reservation_date, r.start_time,
           LEAST(r.end_time, TIME '20:00') AS end_time,
           u.age_bracket, u.gender, d.name as department_name
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE r.reservation_date BETWEEN ${range.start} AND ${range.end}
      AND r.status IN ('confirmed', 'completed')
      AND r.start_time < TIME '20:00'
      ${therapistClause}
      ${attrClause}
  `;
}

/** Distinct users (role='user') who booked at least once within `range`, matching filters. */
async function getDistinctUserCount(
  range: DateRange,
  filters: AttributeFilter,
  therapistId?: string,
  extra?: { attribute: AttributeKind; value: string }
): Promise<number> {
  const therapistClause = therapistId ? sql`AND r.therapist_id = ${therapistId}` : sql``;
  const attrClause = attributeWhere(filters, extra);

  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(DISTINCT r.user_id)::int as n
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE r.reservation_date BETWEEN ${range.start} AND ${range.end}
      AND r.status IN ('confirmed', 'completed')
      ${therapistClause}
      ${attrClause}
  `;
  return rows[0].n;
}

function sumShiftMinutes(shifts: ShiftRow[]): number {
  return shifts.reduce((sum, s) => sum + minutesBetween(s.start_time, s.end_time), 0);
}

function sumReservationMinutes(reservations: ReservationRow[]): number {
  return reservations.reduce((sum, r) => sum + reservationMinutes(r), 0);
}

/** Sum of actual treatment minutes only (no CLEANUP_BUFFER_MINUTES) — for
 * 平均施術時間, which is labeled as treatment time, not occupied-room time. */
function sumTreatmentMinutes(reservations: ReservationRow[]): number {
  return reservations.reduce((sum, r) => sum + minutesBetween(r.start_time, r.end_time), 0);
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function rateOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

export type OverallStats = {
  utilizationRate: number;
  reservationCount: number;
  distinctUsers: number;
  avgDurationMinutes: number;
};

/**
 * 利用率 = 稼働時間ベース: booked minutes (of reservations matching `filters`) ÷
 * total available shift minutes (unaffected by client-attribute filters, since
 * availability is a room/therapist property, not a client one). Always this
 * one basis regardless of whether a filter is active, so it stays directly
 * comparable to the trend chart above it (getUtilizationTrend) and the
 * per-attribute trend breakdown (getUtilizationTrendByAttribute) — the
 * headcount-based 属性別 利用率 panel (getAttributeUtilization) answers a
 * different question and is labeled separately in the UI.
 */
export async function getOverallStats(range: DateRange, filters: AttributeFilter): Promise<OverallStats> {
  const reservations = await fetchReservations(range, filters);
  const bookedMinutes = sumReservationMinutes(reservations);

  const utilizationRate = rate(bookedMinutes, sumShiftMinutes(await fetchShifts(range)));

  return {
    utilizationRate,
    reservationCount: reservations.length,
    distinctUsers: new Set(reservations.map((r) => r.user_id)).size,
    avgDurationMinutes:
      reservations.length > 0 ? Math.round(sumTreatmentMinutes(reservations) / reservations.length) : 0,
  };
}

export type TrendPoint = { label: string; currentRate: number | null; previousRate: number | null; closed: boolean };

/** 利用率の推移: bucketed by trendBuckets(period, range) — hour-of-day for "day",
 * weekday for "week", week-of-month for "month", month for "year". Same
 * 稼働時間ベース basis as getOverallStats (see its comment), so the trend line
 * and the stat tile always agree. Pass therapistId to scope the whole trend
 * to one therapist (used by the individual view). */
export async function getUtilizationTrend(
  period: PeriodType,
  currentRange: DateRange,
  previousRange: DateRange,
  filters: AttributeFilter,
  therapistId?: string
): Promise<TrendPoint[]> {
  async function seriesFor(outerRange: DateRange): Promise<(number | null)[]> {
    const buckets = trendBuckets(period, outerRange);
    return Promise.all(
      buckets.map(async (b) => {
        const { booked, available } = await countMinutesInBucket(b, outerRange, therapistId, filters);
        return rateOrNull(booked, available);
      })
    );
  }

  const currentBuckets = trendBuckets(period, currentRange);
  const current = await seriesFor(currentRange);
  const previous = await seriesFor(previousRange);

  return currentBuckets.map((b, i) => ({
    label: b.label,
    currentRate: current[i] ?? null,
    previousRate: previous[i] ?? null,
    closed: b.closed,
  }));
}

export type AttributeTrendSeries = {
  valueLabel: string;
  points: { label: string; rate: number | null; previousRate: number | null; closed: boolean }[];
};

/** Wraps the plain occupancy trend (getUtilizationTrend's currentRate) as an
 * AttributeTrendSeries so it can be overlaid alongside per-value breakdown
 * lines when the admin checks "全体" — lets them compare, e.g., 男性/女性
 * against the whole-population line on the same chart. */
export function overallAttributeSeries(points: TrendPoint[]): AttributeTrendSeries {
  return {
    valueLabel: "全体",
    points: points.map((p) => ({ label: p.label, rate: p.currentRate, previousRate: p.previousRate, closed: p.closed })),
  };
}

/**
 * One 利用率 line PER VALUE of `attribute` (e.g. 男性/女性), for direct
 * side-by-side comparison over time — checked via the checkboxes next to
 * "属性で絞り込み". Each line is the slice of the OVERALL occupancy rate
 * attributable to that value: rate = (booked minutes by clients of this
 * value) ÷ (total available shift minutes — the same denominator the plain
 * 利用率 line uses). So if the overall rate is 50% and male clients account
 * for 30% of the bookings that make up that 50%, the 男性 line reads
 * 50%×30%=15% — the per-value lines for a dimension sum back to the overall
 * rate, they don't each independently answer "what % of this group used it".
 * Composes with any active top-filter.
 */
export async function getUtilizationTrendByAttribute(
  period: PeriodType,
  range: DateRange,
  previousRange: DateRange,
  attribute: AttributeKind,
  filters: AttributeFilter,
  therapistId?: string,
  selectedKeys?: string[]
): Promise<AttributeTrendSeries[]> {
  const buckets = trendBuckets(period, range);
  const available = await Promise.all(
    buckets.map(async (b) => (await countMinutesInBucket(b, range, therapistId)).available)
  );
  const keys =
    selectedKeys && selectedKeys.length > 0
      ? attributeOrder(attribute).filter((k) => selectedKeys.includes(k))
      : attributeOrder(attribute);

  return Promise.all(
    keys.map(async (key) => {
      const extra = { attribute, value: key };
      const previousBuckets = trendBuckets(period, previousRange);
      const points = await Promise.all(
        buckets.map(async (b, i) => {
          const pb = previousBuckets[i];
          const previousRate = pb
            ? rateOrNull(
                await countBookedMinutesInBucket(pb, previousRange, filters, therapistId, extra),
                (await countMinutesInBucket(pb, previousRange, therapistId)).available
              )
            : null;
          return {
            label: b.label,
            rate: rateOrNull(await countBookedMinutesInBucket(b, range, filters, therapistId, extra), available[i]),
            previousRate,
            closed: b.closed,
          };
        })
      );
      return { valueLabel: attributeLabel(attribute, key), points };
    })
  );
}

export type TrendChartData = { trend: TrendPoint[] | null; series: AttributeTrendSeries[] };

/**
 * The trend panel's entire dataset for one page render: either the plain
 * occupancy line (nothing checked) or the checked values' breakdown lines,
 * with the 「全体」reference line prepended when that box is checked.
 *
 * The 全体 line is computed with DEFAULT_FILTER, never the page's `filters` —
 * it means "the whole population" BY DEFINITION, so it must not move when
 * other checked boxes narrow the page. Passing `filters` here is what made
 * 全体+20代 draw the 20代 line twice (invisible reference line) and made the
 * 全体 line's value depend on which other boxes were checked.
 *
 * Shared by both dashboard routes so the 全体 and per-therapist views cannot
 * drift apart on any of this.
 */
export async function getTrendChartData({
  period,
  range,
  previousRange,
  lineAttr,
  lineValues,
  filters,
  therapistId,
}: {
  period: PeriodType;
  range: DateRange;
  previousRange: DateRange;
  lineAttr: AttributeKind;
  lineValues: string[];
  filters: AttributeFilter;
  therapistId?: string;
}): Promise<TrendChartData> {
  if (lineValues.length === 0) {
    return { trend: await getUtilizationTrend(period, range, previousRange, filters, therapistId), series: [] };
  }

  const attributeKeys = lineValues.filter((v) => v !== OVERALL_ATTRIBUTE_VALUE);
  const [overall, byAttribute] = await Promise.all([
    lineValues.includes(OVERALL_ATTRIBUTE_VALUE)
      ? getUtilizationTrend(period, range, previousRange, DEFAULT_FILTER, therapistId).then(overallAttributeSeries)
      : null,
    attributeKeys.length > 0
      ? getUtilizationTrendByAttribute(period, range, previousRange, lineAttr, filters, therapistId, attributeKeys)
      : [],
  ]);

  return { trend: null, series: [...(overall ? [overall] : []), ...byAttribute] };
}

/** Booked minutes within one bucket, narrowed to reservations matching `extra`
 * (and any active top-filter) — the numerator for getUtilizationTrendByAttribute. */
async function countBookedMinutesInBucket(
  bucket: TrendBucket,
  outerRange: DateRange,
  filters: AttributeFilter,
  therapistId: string | undefined,
  extra: { attribute: AttributeKind; value: string }
): Promise<number> {
  const bucketClause =
    bucket.kind === "hour"
      ? sql`AND r.reservation_date BETWEEN ${outerRange.start} AND ${outerRange.end} AND EXTRACT(HOUR FROM r.start_time)::int = ${bucket.hour}`
      : sql`AND r.reservation_date BETWEEN ${bucket.start} AND ${bucket.end}`;
  const therapistClause = therapistId ? sql`AND r.therapist_id = ${therapistId}` : sql``;
  const attrClause = attributeWhere(filters, extra);

  const rows = await sql<{ start_time: string; end_time: string }[]>`
    SELECT r.start_time, LEAST(r.end_time, TIME '20:00') AS end_time
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE r.status IN ('confirmed', 'completed')
      AND r.start_time < TIME '20:00'
      ${bucketClause}
      ${therapistClause}
      ${attrClause}
  `;
  return rows.reduce((sum, r) => sum + reservationMinutes(r), 0);
}

/** Booked vs. available (shift) minutes within one trend bucket — the occupancy
 * building block shared by getUtilizationTrend and getShiftBreakdownTrend.
 * `filters` narrows the booked side to reservations matching an active
 * attribute filter; callers that only need `available` (which is unaffected
 * by client-attribute filters) can leave it at the default. */
async function countMinutesInBucket(
  bucket: TrendBucket,
  outerRange: DateRange,
  therapistId?: string,
  filters: AttributeFilter = DEFAULT_FILTER
): Promise<{ booked: number; available: number }> {
  const shifts = await fetchShifts(outerRange, therapistId);
  const reservations = await fetchReservations(outerRange, filters, therapistId);

  let available = 0;
  for (const s of shifts) {
    if (bucket.kind === "date" && (s.work_date < bucket.start || s.work_date > bucket.end)) continue;
    const startH = hourOf(s.start_time);
    const endH = hourOf(s.end_time);
    for (let h = startH; h < endH; h++) {
      if (bucket.kind === "hour" && h !== bucket.hour) continue;
      available += 60;
    }
  }

  let booked = 0;
  for (const r of reservations) {
    if (bucket.kind === "date") {
      if (r.reservation_date < bucket.start || r.reservation_date > bucket.end) continue;
    } else if (hourOf(r.start_time) !== bucket.hour) {
      continue;
    }
    booked += reservationMinutes(r);
  }

  return { booked, available };
}

export type ShiftBreakdownPoint = {
  label: string;
  // Rounded independently to the nearest 0.1h for their own display — do NOT
  // add these back together for a total. Since each is rounded separately,
  // their sum can drift from the true total by up to ~0.1h (e.g. 0.75h and
  // 0.25h independently round to 0.8h and 0.3h, summing to 1.1h though the
  // real total is 1.0h). Use `totalHours` for the total and for sizing the
  // bar; these two are for the in-bar labels only.
  bookedHours: number | null;
  vacantHours: number | null;
  // Rounded from the raw available-minutes figure directly, not from
  // bookedHours + vacantHours, so it reflects the true total rather than
  // accumulated rounding error from the two independently-rounded halves.
  totalHours: number | null;
  closed: boolean;
};

/** 出勤可能時間 = 稼働時間（予約で埋まっていた時間。片付けバッファ込みの占有時間で、
 * 平均施術時間とは異なり実施術時間だけを指すものではない） + 空き時間（残り）、÷ 60 —
 * a standalone 空き時間-only chart drew the same shift-time axis as the
 * utilization chart next to it but told only half the story (vacant time
 * alone doesn't say vacant relative to what); returning both halves lets the
 * chart stack them into one bar per bucket instead. Bucketed with the SAME
 * trendBuckets() as getUtilizationTrend so the two charts stay visually
 * synced regardless of period. Pass therapistId to scope to one therapist
 * (used by the individual view). */
export async function getShiftBreakdownTrend(
  period: PeriodType,
  range: DateRange,
  therapistId?: string
): Promise<ShiftBreakdownPoint[]> {
  const buckets = trendBuckets(period, range);
  return Promise.all(
    buckets.map(async (b) => {
      const { booked, available } = await countMinutesInBucket(b, range, therapistId);
      return {
        label: b.label,
        bookedHours: available > 0 ? Math.round(Math.min(booked, available) / 6) / 10 : null,
        vacantHours: available > 0 ? Math.round(Math.max(0, available - booked) / 6) / 10 : null,
        totalHours: available > 0 ? Math.round(available / 6) / 10 : null,
        closed: b.closed,
      };
    })
  );
}

export type TherapistUtilization = { therapistId: string; name: string; rate: number };

/**
 * 施術者別 利用率 — the one exception to the occupancy/headcount switch above:
 * this is always each therapist's own SCHEDULE occupancy (booked minutes ÷
 * available shift minutes), regardless of filters. Kept that way because the
 * mockup's own explanatory note ("佐藤は午前のみ勤務のため利用率が低め") only makes
 * sense for an occupancy metric — working fewer hours mechanically lowers
 * occupancy, but wouldn't lower a distinct-client-count ratio the same way.
 */
export async function getTherapistUtilization(
  range: DateRange,
  filters: AttributeFilter
): Promise<TherapistUtilization[]> {
  const therapists = await sql<{ therapist_id: string; name: string }[]>`
    SELECT tp.id as therapist_id, u.name FROM therapist_profiles tp
    JOIN users u ON u.id = tp.user_id WHERE tp.is_active = true ORDER BY u.name
  `;

  return Promise.all(
    therapists.map(async (t) => {
      const shifts = await fetchShifts(range, t.therapist_id);
      const reservations = await fetchReservations(range, filters, t.therapist_id);
      return {
        therapistId: t.therapist_id,
        name: t.name,
        rate: rate(sumReservationMinutes(reservations), sumShiftMinutes(shifts)),
      };
    })
  );
}

export type AttributeBucket = { label: string; rate: number };

const AGE_LABELS: Record<string, string> = { "20s": "20代", "30s": "30代", "40s": "40代", "50s_plus": "50代以上" };
const GENDER_LABELS: Record<string, string> = { male: "男性", female: "女性", unspecified: "未回答" };

function attributeOrder(attribute: AttributeKind): string[] {
  return attribute === "age"
    ? ["20s", "30s", "40s", "50s_plus"]
    : attribute === "gender"
      ? ["male", "female"]
      : ["開発部", "営業部", "総務部", "その他"];
}

function attributeLabel(attribute: AttributeKind, key: string): string {
  return attribute === "age" ? AGE_LABELS[key] : attribute === "gender" ? GENDER_LABELS[key] : key;
}

/** The checkbox choices available once a dimension tab (年代/性別/部署) is active
 * — e.g. for "age": 20代/30代/40代/50代以上. Used to build the value-level
 * checkboxes nested under the trend-chart's dimension tabs. */
export function attributeValueOptions(attribute: AttributeKind): { value: string; label: string }[] {
  return attributeOrder(attribute).map((key) => ({ value: key, label: attributeLabel(attribute, key) }));
}

function filterValuesFor(filters: AttributeFilter, attribute: AttributeKind): string[] {
  return attribute === "age" ? filters.ageBracket : attribute === "gender" ? filters.gender : filters.department;
}

/** 属性別 利用率: 20代の割合 = 20代で利用した人数 ÷ 利用した人数の合計（属性を
 * 問わない）— the denominator is everyone who actually used it in `range`
 * (narrowed by any other active top-filter, e.g. gender=男性), not the whole
 * company headcount, so the stacked bar's segments sum to ~100% instead of
 * to whatever fraction of the whole company happened to book.
 *
 * If `attribute` is ITSELF the actively-filtered dimension (e.g. viewing the
 * 年代 breakdown while checked boxes have already filtered to 20代), a bucket
 * outside the checked values is 0 by construction — nobody in the (already
 * age=20代-only) population can also be 30代 — so it's short-circuited
 * instead of querying attributeWhere's `extra` override, which replaces
 * rather than intersects with the top filter and would otherwise ignore it
 * for this one dimension. */
export async function getAttributeUtilization(
  range: DateRange,
  attribute: AttributeKind,
  filters: AttributeFilter,
  therapistId?: string
): Promise<AttributeBucket[]> {
  const totalUsers = await getDistinctUserCount(range, filters, therapistId);
  const activeValues = filterValuesFor(filters, attribute);
  return Promise.all(
    attributeOrder(attribute).map(async (key) => {
      if (activeValues.length > 0 && !activeValues.includes(key)) {
        return { label: attributeLabel(attribute, key), rate: 0 };
      }
      const extra = { attribute, value: key };
      return {
        label: attributeLabel(attribute, key),
        rate: rate(await getDistinctUserCount(range, filters, therapistId, extra), totalUsers),
      };
    })
  );
}

/** getAttributeUtilization for all three dimensions at once — the「属性別 利用率」
 * panel shows 年代/性別/部署 together rather than behind a tab switcher, since
 * flipping through one dimension at a time hid the other two's ratios. */
export async function getAllAttributeUtilization(
  range: DateRange,
  filters: AttributeFilter,
  therapistId?: string
): Promise<Record<AttributeKind, AttributeBucket[]>> {
  const [age, gender, department] = await Promise.all(
    ALL_ATTRIBUTES.map((a) => getAttributeUtilization(range, a, filters, therapistId))
  );
  return { age, gender, department };
}

/** Share (%) of a therapist's own DISTINCT clients per attribute bucket — sums
 * to ~100, unlike getAttributeUtilization. Denominator/numerator are both
 * per-client (one vote per user_id), not per-reservation, so a client with
 * many repeat bookings doesn't skew the mix (each user's attribute is taken
 * once, from their first reservation in range). */
function clientAttributeShare(reservations: ReservationRow[], attribute: AttributeKind): AttributeBucket[] {
  const attributeByUser = new Map<string, string>();
  for (const r of reservations) {
    if (attributeByUser.has(r.user_id)) continue;
    const key =
      attribute === "age"
        ? r.age_bracket ?? "unknown"
        : attribute === "gender"
          ? r.gender
          : r.department_name ?? "その他";
    attributeByUser.set(r.user_id, key);
  }
  const total = attributeByUser.size;

  const counts = new Map<string, number>();
  for (const key of attributeByUser.values()) {
    if (attribute === "age" && key === "unknown") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return attributeOrder(attribute).map((key) => ({
    label: attributeLabel(attribute, key),
    rate: total > 0 ? Math.round(((counts.get(key) ?? 0) / total) * 100) : 0,
  }));
}

/** clientAttributeShare for all three dimensions at once — same tabs-removal
 * rationale as getAllAttributeUtilization, for the individual view's「〇〇の
 * 利用者属性」panel. Fetches reservations once and reuses it across dimensions
 * instead of re-querying per dimension. */
export async function getAllClientAttributeShare(
  range: DateRange,
  therapistId: string,
  filters: AttributeFilter = DEFAULT_FILTER
): Promise<Record<AttributeKind, AttributeBucket[]>> {
  const reservations = await fetchReservations(range, filters, therapistId);
  return {
    age: clientAttributeShare(reservations, "age"),
    gender: clientAttributeShare(reservations, "gender"),
    department: clientAttributeShare(reservations, "department"),
  };
}

export type TherapistSummary = {
  therapistId: string;
  name: string;
  specialties: string[];
  bio: string | null;
  roomName: string | null;
  personalRate: number;
  overallAvgRate: number;
  reservationCount: number;
  distinctUsers: number;
  avgDurationMinutes: number;
};

/** 個人利用率: this therapist's booked ÷ shift minutes, always — same
 * 稼働時間ベース basis as getOverallStats regardless of whether a filter is
 * active, so 全体平均 (計算方法は全社共通) is always a fair comparison. */
export async function getTherapistSummary(
  therapistId: string,
  range: DateRange,
  filters: AttributeFilter
): Promise<TherapistSummary> {
  const profiles = await sql<
    { therapist_id: string; name: string; specialties: string[] | null; bio: string | null; room_name: string | null }[]
  >`
    SELECT tp.id as therapist_id, u.name, tp.specialties, tp.bio, r.name as room_name
    FROM therapist_profiles tp
    JOIN users u ON u.id = tp.user_id
    LEFT JOIN rooms r ON r.id = tp.room_id
    WHERE tp.id = ${therapistId}
  `;
  const profile = profiles[0];
  if (!profile) {
    throw new Error(`Unknown therapist: ${therapistId}`);
  }

  const reservations = await fetchReservations(range, filters, therapistId);
  const bookedMinutes = sumReservationMinutes(reservations);
  const distinctUsers = new Set(reservations.map((r) => r.user_id)).size;

  const personalRate = rate(bookedMinutes, sumShiftMinutes(await fetchShifts(range, therapistId)));
  const overallAvgRate = rate(
    sumReservationMinutes(await fetchReservations(range, filters)),
    sumShiftMinutes(await fetchShifts(range))
  );

  return {
    therapistId: profile.therapist_id,
    name: profile.name,
    specialties: profile.specialties ?? [],
    bio: profile.bio,
    roomName: profile.room_name,
    personalRate,
    overallAvgRate,
    reservationCount: reservations.length,
    distinctUsers,
    avgDurationMinutes:
      reservations.length > 0 ? Math.round(sumTreatmentMinutes(reservations) / reservations.length) : 0,
  };
}

export type TherapistOption = { therapistId: string; name: string };

export async function listTherapists(): Promise<TherapistOption[]> {
  return sql<TherapistOption[]>`
    SELECT tp.id as "therapistId", u.name FROM therapist_profiles tp
    JOIN users u ON u.id = tp.user_id WHERE tp.is_active = true ORDER BY u.name
  `;
}

export async function listDepartments(): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`SELECT name FROM departments ORDER BY name`;
  return rows.map((d) => d.name);
}
