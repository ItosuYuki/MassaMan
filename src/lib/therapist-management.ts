import "server-only";
import { sql } from "@/lib/db";

export type TherapistManagementItem = {
  therapistId: string;
  name: string;
  initial: string;
  utilizationRate: number;
  satisfaction: number | null;
  reviewCount: number;
  workStatus: string;
};

export type TherapistReview = {
  id: string;
  rating: number;
  departmentName: string;
  comment: string | null;
  dateLabel: string;
};

type TherapistManagementRow = {
  therapist_id: string;
  name: string;
  utilization_rate: number;
  satisfaction: number | null;
  review_count: number;
  work_status: string;
};

function initialFor(name: string): string {
  return name.trim().split(/\s+/).at(-1)?.slice(0, 1) ?? "?";
}

/**
 * 管理画面の稼働率は直近30日間の予約時間 / 勤務時間で集計する。
 * 口コミ集計とは別クエリにして、口コミ側で利用者の氏名を扱わないようにする。
 */
export async function listTherapistManagementItems(): Promise<TherapistManagementItem[]> {
  const rows = await sql<TherapistManagementRow[]>`
    SELECT
      tp.id AS therapist_id,
      u.name,
      COALESCE(
        ROUND(
          100.0 * (
            SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(r.end_time, TIME '20:00') - r.start_time)) / 60.0 + 15), 0)
            FROM reservations r
            WHERE r.therapist_id = tp.id
              AND r.reservation_date BETWEEN CURRENT_DATE - INTERVAL '30 days' AND CURRENT_DATE
              AND r.status IN ('confirmed', 'completed')
              AND r.start_time < TIME '20:00'
          ) / NULLIF((
            SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(ts.end_time, TIME '20:00') - ts.start_time)) / 60.0), 0)
            FROM therapist_shifts ts
            WHERE ts.therapist_id = tp.id
              AND ts.work_date BETWEEN CURRENT_DATE - INTERVAL '30 days' AND CURRENT_DATE
              AND ts.start_time < TIME '20:00'
          ), 0)
        ),
        0
      )::int AS utilization_rate,
      (
        SELECT AVG(rv.rating)::numeric(3, 2)
        FROM reviews rv
        JOIN reservations rr ON rr.id = rv.reservation_id
        WHERE rr.therapist_id = tp.id
      ) AS satisfaction,
      (
        SELECT COUNT(*)::int
        FROM reviews rv
        JOIN reservations rr ON rr.id = rv.reservation_id
        WHERE rr.therapist_id = tp.id
      ) AS review_count,
      CASE
        WHEN today_shift.start_time IS NULL THEN '休み'
        WHEN CURRENT_TIME < today_shift.start_time THEN '勤務予定'
        WHEN CURRENT_TIME < today_shift.end_time THEN '勤務中'
        ELSE '勤務終了'
      END AS work_status
    FROM therapist_profiles tp
    JOIN users u ON u.id = tp.user_id
    LEFT JOIN LATERAL (
      SELECT ts.start_time, ts.end_time
      FROM therapist_shifts ts
      WHERE ts.therapist_id = tp.id
        AND ts.work_date = CURRENT_DATE
      LIMIT 1
    ) today_shift ON true
    WHERE tp.is_active = true
      AND u.is_active = true
    ORDER BY u.name
  `;

  return rows.map((row) => ({
    therapistId: row.therapist_id,
    name: row.name,
    initial: initialFor(row.name),
    utilizationRate: Math.max(0, Math.min(100, row.utilization_rate)),
    satisfaction: row.satisfaction === null ? null : Number(row.satisfaction),
    reviewCount: row.review_count,
    workStatus: row.work_status,
  }));
}

/**
 * 口コミ一覧では投稿者のユーザー情報を部署名に限定して返す。
 * 氏名・社員番号・メールアドレスはSQLのSELECT対象に含めない。
 */
export async function listTherapistReviews(therapistId: string): Promise<TherapistReview[]> {
  return sql<TherapistReview[]>`
    SELECT
      rv.id,
      rv.rating,
      COALESCE(d.name, '所属不明') AS "departmentName",
      rv.comment,
      TO_CHAR(rv.created_at AT TIME ZONE 'Asia/Tokyo', 'M/DD') AS "dateLabel"
    FROM reviews rv
    JOIN reservations r ON r.id = rv.reservation_id
    JOIN users u ON u.id = r.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE r.therapist_id = ${therapistId}
    ORDER BY rv.created_at DESC
  `;
}

export type TherapistRegistrationOptions = {
  rooms: { id: string; name: string }[];
};

export async function getTherapistRegistrationOptions(): Promise<TherapistRegistrationOptions> {
  const rooms = await sql<{ id: string; name: string }[]>`SELECT id, name FROM rooms ORDER BY name`;

  return { rooms };
}
