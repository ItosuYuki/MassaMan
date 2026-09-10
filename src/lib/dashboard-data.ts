import "server-only";
import { db } from "@/lib/db";
import { trendBuckets, HOURS, type DateRange, type PeriodType, type TrendBucket } from "@/lib/period";

export { HOURS };

export type AttributeKind = "age" | "gender" | "department";

export type AttributeFilter = {
  ageBracket: string; // "all" | "20s" | "30s" | "40s" | "50s_plus"
  gender: string; // "all" | "male" | "female"
  department: string; // "all" | department name
};

export const DEFAULT_FILTER: AttributeFilter = { ageBracket: "all", gender: "all", department: "all" };

function isFiltered(filters: AttributeFilter): boolean {
  return filters.ageBracket !== "all" || filters.gender !== "all" || filters.department !== "all";
}

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

function hourOf(time: string): number {
  return Number(time.split(":")[0]);
}

function fetchShifts(range: DateRange, therapistId?: string): ShiftRow[] {
  const sql = therapistId
    ? "SELECT therapist_id, work_date, start_time, end_time FROM therapist_shifts WHERE work_date BETWEEN ? AND ? AND therapist_id = ?"
    : "SELECT therapist_id, work_date, start_time, end_time FROM therapist_shifts WHERE work_date BETWEEN ? AND ?";
  const params = therapistId ? [range.start, range.end, therapistId] : [range.start, range.end];
  return db.prepare(sql).all(...params) as ShiftRow[];
}

/** WHERE-clause fragments + params for the age/gender/department filters, shared by
 * reservation and headcount queries so the two stay in sync (§ the "全体をその属性
 * 全体で考える" rule: narrowing the numerator must narrow the denominator to match). */
function attributeWhere(
  filters: AttributeFilter,
  extra?: { attribute: AttributeKind; value: string }
): { clause: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  const age = extra?.attribute === "age" ? extra.value : filters.ageBracket;
  const gender = extra?.attribute === "gender" ? extra.value : filters.gender;
  const department = extra?.attribute === "department" ? extra.value : filters.department;

  if (age !== "all") {
    clauses.push("u.age_bracket = ?");
    params.push(age);
  }
  if (gender !== "all") {
    clauses.push("u.gender = ?");
    params.push(gender);
  }
  if (department !== "all") {
    clauses.push("d.name = ?");
    params.push(department);
  }

  return { clause: clauses.map((c) => ` AND ${c}`).join(""), params };
}

function fetchReservations(
  range: DateRange,
  filters: AttributeFilter,
  therapistId?: string
): ReservationRow[] {
  let sql = `
    SELECT r.therapist_id, r.user_id, r.reservation_date, r.start_time, r.end_time,
           u.age_bracket, u.gender, d.name as department_name
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE r.reservation_date BETWEEN ? AND ?
      AND r.status IN ('confirmed', 'completed')
  `;
  const params: (string | number)[] = [range.start, range.end];

  if (therapistId) {
    sql += " AND r.therapist_id = ?";
    params.push(therapistId);
  }
  const attr = attributeWhere(filters);
  sql += attr.clause;
  params.push(...attr.params);

  return db.prepare(sql).all(...params) as ReservationRow[];
}

/** Total *headcount* (role='user' employees) matching the given filters — the
 * denominator for headcount-based 利用率 calculations (used only when a
 * age/gender/department filter is actually active — see isFiltered()). */
function getHeadcount(filters: AttributeFilter, extra?: { attribute: AttributeKind; value: string }): number {
  let sql = `
    SELECT COUNT(*) as n FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.role = 'user' AND u.is_active = 1
  `;
  const attr = attributeWhere(filters, extra);
  sql += attr.clause;
  const row = db.prepare(sql).get(...attr.params) as { n: number };
  return row.n;
}

/** Distinct users (role='user') who booked at least once within `range`, matching filters. */
function getDistinctUserCount(
  range: DateRange,
  filters: AttributeFilter,
  therapistId?: string,
  extra?: { attribute: AttributeKind; value: string }
): number {
  let sql = `
    SELECT COUNT(DISTINCT r.user_id) as n
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE r.reservation_date BETWEEN ? AND ?
      AND r.status IN ('confirmed', 'completed')
  `;
  const params: (string | number)[] = [range.start, range.end];
  if (therapistId) {
    sql += " AND r.therapist_id = ?";
    params.push(therapistId);
  }
  const attr = attributeWhere(filters, extra);
  sql += attr.clause;
  params.push(...attr.params);

  const row = db.prepare(sql).get(...params) as { n: number };
  return row.n;
}

function sumShiftMinutes(shifts: ShiftRow[]): number {
  return shifts.reduce((sum, s) => sum + minutesBetween(s.start_time, s.end_time), 0);
}

function sumReservationMinutes(reservations: ReservationRow[]): number {
  return reservations.reduce((sum, r) => sum + minutesBetween(r.start_time, r.end_time), 0);
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

export type OverallStats = {
  utilizationRate: number;
  reservationCount: number;
  distinctUsers: number;
  avgDurationMinutes: number;
};

/**
 * 利用率. Two modes, chosen so the number always reads naturally:
 * - No attribute filter active: schedule occupancy — booked minutes ÷ available
 *   shift minutes (how full is the whole operation).
 * - A filter IS active (e.g. gender=男性): headcount ratio — 利用した社員数 ÷
 *   会社の全社員数 for that group, since "occupancy of male employees" isn't a
 *   coherent question, but "what fraction of male employees used it" is.
 */
export function getOverallStats(range: DateRange, filters: AttributeFilter): OverallStats {
  const reservations = fetchReservations(range, filters);
  const bookedMinutes = sumReservationMinutes(reservations);

  const utilizationRate = isFiltered(filters)
    ? rate(getDistinctUserCount(range, filters), getHeadcount(filters))
    : rate(bookedMinutes, sumShiftMinutes(fetchShifts(range)));

  return {
    utilizationRate,
    reservationCount: reservations.length,
    distinctUsers: new Set(reservations.map((r) => r.user_id)).size,
    avgDurationMinutes: reservations.length > 0 ? Math.round(bookedMinutes / reservations.length) : 0,
  };
}

export type TrendPoint = { label: string; currentRate: number; previousRate: number; closed: boolean };

/** 利用率の推移: bucketed by trendBuckets(period, range) — hour-of-day for "day",
 * weekday for "week", week-of-month for "month", month for "year". Same
 * occupancy-vs-headcount switch as getOverallStats (see its comment), so the
 * trend line and the stat tile always agree. Pass therapistId to scope the
 * whole trend to one therapist (used by the individual view). */
export function getUtilizationTrend(
  period: PeriodType,
  currentRange: DateRange,
  previousRange: DateRange,
  filters: AttributeFilter,
  therapistId?: string
): TrendPoint[] {
  const filtered = isFiltered(filters);
  const headcount = filtered ? getHeadcount(filters) : 0;

  function seriesFor(outerRange: DateRange): number[] {
    const buckets = trendBuckets(period, outerRange);
    return buckets.map((b) => {
      if (filtered) {
        return rate(countUsersInBucket(b, outerRange, filters, therapistId), headcount);
      }
      const { booked, available } = countMinutesInBucket(b, outerRange, therapistId);
      return rate(booked, available);
    });
  }

  const currentBuckets = trendBuckets(period, currentRange);
  const current = seriesFor(currentRange);
  const previous = seriesFor(previousRange);

  return currentBuckets.map((b, i) => ({
    label: b.label,
    currentRate: current[i] ?? 0,
    previousRate: previous[i] ?? 0,
    closed: b.closed,
  }));
}

export type AttributeTrendSeries = {
  valueLabel: string;
  points: { label: string; rate: number; closed: boolean }[];
};

/** Sentinel value for the "全体" checkbox — not a real age/gender/department
 * key, so it's filtered out before reaching getUtilizationTrendByAttribute and
 * handled separately via overallAttributeSeries. */
export const OVERALL_ATTRIBUTE_VALUE = "__all__";

/** Wraps the plain occupancy trend (getUtilizationTrend's currentRate) as an
 * AttributeTrendSeries so it can be overlaid alongside per-value breakdown
 * lines when the admin checks "全体" — lets them compare, e.g., 男性/女性
 * against the whole-population line on the same chart. */
export function overallAttributeSeries(points: TrendPoint[]): AttributeTrendSeries {
  return {
    valueLabel: "全体",
    points: points.map((p) => ({ label: p.label, rate: p.currentRate, closed: p.closed })),
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
export function getUtilizationTrendByAttribute(
  period: PeriodType,
  range: DateRange,
  attribute: AttributeKind,
  filters: AttributeFilter,
  therapistId?: string,
  selectedKeys?: string[]
): AttributeTrendSeries[] {
  const buckets = trendBuckets(period, range);
  const available = buckets.map((b) => countMinutesInBucket(b, range, therapistId).available);
  const keys =
    selectedKeys && selectedKeys.length > 0
      ? attributeOrder(attribute).filter((k) => selectedKeys.includes(k))
      : attributeOrder(attribute);

  return keys.map((key) => {
    const extra = { attribute, value: key };
    return {
      valueLabel: attributeLabel(attribute, key),
      points: buckets.map((b, i) => ({
        label: b.label,
        rate: rate(countBookedMinutesInBucket(b, range, filters, therapistId, extra), available[i]),
        closed: b.closed,
      })),
    };
  });
}

/** Booked minutes within one bucket, narrowed to reservations matching `extra`
 * (and any active top-filter) — the numerator for getUtilizationTrendByAttribute. */
function countBookedMinutesInBucket(
  bucket: TrendBucket,
  outerRange: DateRange,
  filters: AttributeFilter,
  therapistId: string | undefined,
  extra: { attribute: AttributeKind; value: string }
): number {
  let sql = `
    SELECT r.start_time, r.end_time
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE r.status IN ('confirmed', 'completed')
  `;
  const params: (string | number)[] = [];

  if (bucket.kind === "hour") {
    sql += " AND r.reservation_date BETWEEN ? AND ? AND CAST(substr(r.start_time, 1, 2) AS INTEGER) = ?";
    params.push(outerRange.start, outerRange.end, bucket.hour);
  } else {
    sql += " AND r.reservation_date BETWEEN ? AND ?";
    params.push(bucket.start, bucket.end);
  }
  if (therapistId) {
    sql += " AND r.therapist_id = ?";
    params.push(therapistId);
  }

  const attr = attributeWhere(filters, extra);
  sql += attr.clause;
  params.push(...attr.params);

  const rows = db.prepare(sql).all(...params) as { start_time: string; end_time: string }[];
  return rows.reduce((sum, r) => sum + minutesBetween(r.start_time, r.end_time), 0);
}

function countUsersInBucket(
  bucket: TrendBucket,
  outerRange: DateRange,
  filters: AttributeFilter,
  therapistId?: string,
  extra?: { attribute: AttributeKind; value: string }
): number {
  let sql = `
    SELECT COUNT(DISTINCT r.user_id) as n
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE r.status IN ('confirmed', 'completed')
  `;
  const params: (string | number)[] = [];

  if (bucket.kind === "hour") {
    sql += " AND r.reservation_date BETWEEN ? AND ? AND CAST(substr(r.start_time, 1, 2) AS INTEGER) = ?";
    params.push(outerRange.start, outerRange.end, bucket.hour);
  } else {
    sql += " AND r.reservation_date BETWEEN ? AND ?";
    params.push(bucket.start, bucket.end);
  }
  if (therapistId) {
    sql += " AND r.therapist_id = ?";
    params.push(therapistId);
  }

  const attr = attributeWhere(filters, extra);
  sql += attr.clause;
  params.push(...attr.params);

  const row = db.prepare(sql).get(...params) as { n: number };
  return row.n;
}

/** Booked vs. available (shift) minutes within one trend bucket — the occupancy
 * building block shared by getUtilizationTrend and getVacancyTrend. */
function countMinutesInBucket(
  bucket: TrendBucket,
  outerRange: DateRange,
  therapistId?: string
): { booked: number; available: number } {
  const shifts = fetchShifts(outerRange, therapistId);
  const reservations = fetchReservations(outerRange, DEFAULT_FILTER, therapistId);

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
    booked += minutesBetween(r.start_time, r.end_time);
  }

  return { booked, available };
}

export type VacancyPoint = { label: string; vacantHours: number; closed: boolean };

/** 空き時間 = (マッサージ師の出勤可能時間の合計 − マッサージに使われた時間の合計) ÷ 60,
 * bucketed with the SAME trendBuckets() as getUtilizationTrend so the two charts
 * stay visually synced regardless of period. Pass therapistId to scope to one
 * therapist (used by the individual view). */
export function getVacancyTrend(period: PeriodType, range: DateRange, therapistId?: string): VacancyPoint[] {
  const buckets = trendBuckets(period, range);
  return buckets.map((b) => {
    const { booked, available } = countMinutesInBucket(b, range, therapistId);
    return {
      label: b.label,
      vacantHours: Math.round(Math.max(0, available - booked) / 6) / 10,
      closed: b.closed,
    };
  });
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
export function getTherapistUtilization(range: DateRange, filters: AttributeFilter): TherapistUtilization[] {
  const therapists = db
    .prepare(
      `SELECT tp.id as therapist_id, u.name FROM therapist_profiles tp
       JOIN users u ON u.id = tp.user_id WHERE tp.is_active = 1 ORDER BY u.name`
    )
    .all() as { therapist_id: string; name: string }[];

  return therapists.map((t) => {
    const shifts = fetchShifts(range, t.therapist_id);
    const reservations = fetchReservations(range, filters, t.therapist_id);
    return {
      therapistId: t.therapist_id,
      name: t.name,
      rate: rate(sumReservationMinutes(reservations), sumShiftMinutes(shifts)),
    };
  });
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

/** 属性別 利用者数: 20代の利用率 = 20代で利用した人数 ÷ 会社の全利用者数（属性を
 * 問わない）— the denominator is always the WHOLE eligible population (narrowed
 * only by any other active top-filter, e.g. gender=男性), never re-scoped down
 * to the bucket's own subgroup size. That keeps small groups (e.g. a
 * 3-person department) from trivially reading as ~100%. */
export function getAttributeUtilization(
  range: DateRange,
  attribute: AttributeKind,
  filters: AttributeFilter,
  therapistId?: string
): AttributeBucket[] {
  const headcount = getHeadcount(filters);
  return attributeOrder(attribute).map((key) => {
    const extra = { attribute, value: key };
    return {
      label: attributeLabel(attribute, key),
      rate: rate(getDistinctUserCount(range, filters, therapistId, extra), headcount),
    };
  });
}

/** Share (%) of a therapist's own client base per attribute bucket — sums to ~100, unlike getAttributeUtilization. */
export function getClientAttributeShare(
  range: DateRange,
  attribute: AttributeKind,
  therapistId: string
): AttributeBucket[] {
  const reservations = fetchReservations(range, DEFAULT_FILTER, therapistId);
  const total = reservations.length;

  const counts = new Map<string, number>();
  for (const r of reservations) {
    const key =
      attribute === "age"
        ? r.age_bracket ?? "unknown"
        : attribute === "gender"
          ? r.gender
          : r.department_name ?? "その他";
    if (attribute === "age" && key === "unknown") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return attributeOrder(attribute).map((key) => ({
    label: attributeLabel(attribute, key),
    rate: total > 0 ? Math.round(((counts.get(key) ?? 0) / total) * 100) : 0,
  }));
}

export type TherapistSummary = {
  therapistId: string;
  name: string;
  specialties: string | null;
  personalRate: number;
  overallAvgRate: number;
  reservationCount: number;
  repeaterCount: number;
  avgDurationMinutes: number;
};

/** 個人利用率: occupancy (this therapist's booked ÷ shift minutes) when
 * unfiltered, headcount ratio (this therapist's distinct clients ÷ total
 * headcount) when a filter is active — same switch as getOverallStats, so
 * 全体平均 (computed the same way, company-wide) is always a fair comparison. */
export function getTherapistSummary(
  therapistId: string,
  range: DateRange,
  filters: AttributeFilter
): TherapistSummary {
  const profile = db
    .prepare(
      `SELECT tp.id as therapist_id, u.name, tp.specialties FROM therapist_profiles tp
       JOIN users u ON u.id = tp.user_id WHERE tp.id = ?`
    )
    .get(therapistId) as { therapist_id: string; name: string; specialties: string | null } | undefined;

  if (!profile) {
    throw new Error(`Unknown therapist: ${therapistId}`);
  }

  const reservations = fetchReservations(range, filters, therapistId);
  const bookedMinutes = sumReservationMinutes(reservations);

  const userCounts = new Map<string, number>();
  for (const r of reservations) {
    userCounts.set(r.user_id, (userCounts.get(r.user_id) ?? 0) + 1);
  }
  const repeaterCount = [...userCounts.values()].filter((c) => c >= 2).length;

  let personalRate: number;
  let overallAvgRate: number;
  if (isFiltered(filters)) {
    const headcount = getHeadcount(filters);
    personalRate = rate(getDistinctUserCount(range, filters, therapistId), headcount);
    overallAvgRate = rate(getDistinctUserCount(range, filters), headcount);
  } else {
    personalRate = rate(bookedMinutes, sumShiftMinutes(fetchShifts(range, therapistId)));
    overallAvgRate = rate(
      sumReservationMinutes(fetchReservations(range, filters)),
      sumShiftMinutes(fetchShifts(range))
    );
  }

  return {
    therapistId: profile.therapist_id,
    name: profile.name,
    specialties: profile.specialties,
    personalRate,
    overallAvgRate,
    reservationCount: reservations.length,
    repeaterCount,
    avgDurationMinutes: reservations.length > 0 ? Math.round(bookedMinutes / reservations.length) : 0,
  };
}

export type TherapistOption = { therapistId: string; name: string };

export function listTherapists(): TherapistOption[] {
  return db
    .prepare(
      `SELECT tp.id as therapistId, u.name FROM therapist_profiles tp
       JOIN users u ON u.id = tp.user_id WHERE tp.is_active = 1 ORDER BY u.name`
    )
    .all() as TherapistOption[];
}

export function listDepartments(): string[] {
  return (db.prepare("SELECT name FROM departments ORDER BY name").all() as { name: string }[]).map(
    (d) => d.name
  );
}
