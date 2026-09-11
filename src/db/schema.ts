import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  time,
  smallint,
  integer,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", ["user", "therapist", "admin"]);
export const genderEnum = pgEnum("gender", ["male", "female", "unspecified"]);
export const ageBracketEnum = pgEnum("age_bracket", ["20s", "30s", "40s", "50s_plus"]);
export const reservationStatusEnum = pgEnum("reservation_status", [
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);
export const notificationChannelEnum = pgEnum("notification_channel", ["in_app", "email", "slack"]);
export const therapistBreakKindEnum = pgEnum("therapist_break_kind", ["break", "unavailable"]);

// ---------------------------------------------------------------------------
// departments
// ---------------------------------------------------------------------------

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // 開発部／営業部／総務部／その他
});

// ---------------------------------------------------------------------------
// users (利用者・マッサージ師・管理者 共通)
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    employeeCode: text("employee_code").notNull().unique(), // 社員ID（ログインに使用）
    name: text("name").notNull(),
    email: text("email").unique(), // ログインには使用しないため null を許可
    departmentId: uuid("department_id").references(() => departments.id),
    role: userRoleEnum("role").notNull(),
    gender: genderEnum("gender").notNull(),
    ageBracket: ageBracketEnum("age_bracket"), // 生年月日は保持しない（プライバシー最小化）
    passwordHash: text("password_hash").notNull(), // bcrypt ハッシュ
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_users_department_id").on(table.departmentId)]
);

// ---------------------------------------------------------------------------
// therapist_profiles (マッサージ師属性)
// ---------------------------------------------------------------------------

export const therapistProfiles = pgTable("therapist_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  specialties: text("specialties").array(), // 得意分野（肩こり・腰痛 等）
  bio: text("bio"), // 経歴
  photoUrl: text("photo_url"),
  roomId: uuid("room_id").references((): AnyPgColumn => rooms.id), // 担当する部屋（固定割当）
  isActive: boolean("is_active").notNull().default(true), // 休職中等に false
});

// ---------------------------------------------------------------------------
// therapist_shifts (勤務時間登録)
// ---------------------------------------------------------------------------

export const therapistShifts = pgTable(
  "therapist_shifts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    therapistId: uuid("therapist_id")
      .notNull()
      .references(() => therapistProfiles.id),
    workDate: date("work_date", { mode: "string" }).notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("therapist_shifts_therapist_id_work_date_key").on(table.therapistId, table.workDate),
  ]
);

// ---------------------------------------------------------------------------
// therapist_breaks (休憩・その他の不可時間)
// ---------------------------------------------------------------------------
//
// kind distinguishes a plain 休憩 from an その他 (unavailable) run so
// getDaySchedule can tell them apart on read; label holds the その他 run's
// free-text reason (null for 休憩, and for an その他 run with no reason given).

export const therapistBreaks = pgTable(
  "therapist_breaks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => therapistShifts.id),
    breakStart: time("break_start").notNull(),
    breakEnd: time("break_end").notNull(),
    kind: therapistBreakKindEnum("kind").notNull().default("break"),
    label: text("label"),
  },
  (table) => [index("idx_therapist_breaks_shift_id").on(table.shiftId)]
);

// ---------------------------------------------------------------------------
// rooms (施術室)
// ---------------------------------------------------------------------------

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // ベッドA／ベッドB／ベッドC
});

// ---------------------------------------------------------------------------
// reservations (予約) — 最重要テーブル
// ---------------------------------------------------------------------------
//
// The no_overlap_per_therapist / no_overlap_per_room EXCLUDE USING gist
// constraints (double-booking prevention) are NOT expressible in Drizzle's
// table builder — they're hand-appended to the generated migration in Task 4.

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    therapistId: uuid("therapist_id")
      .notNull()
      .references(() => therapistProfiles.id),
    roomId: uuid("room_id").references(() => rooms.id), // 空いている部屋を予約時に自動割当
    reservationDate: date("reservation_date", { mode: "string" }).notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(), // 1〜45分の範囲。start_timeとの差分がduration
    requestedNote: text("requested_note"),
    status: reservationStatusEnum("status").notNull().default("confirmed"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_reservations_therapist_date").on(table.therapistId, table.reservationDate),
    index("idx_reservations_user_date").on(table.userId, table.reservationDate),
    index("idx_reservations_date_status").on(table.reservationDate, table.status),
  ]
);

// ---------------------------------------------------------------------------
// reviews (口コミ)
// ---------------------------------------------------------------------------
//
// 匿名性: このテーブル自体に user_id は持たせない。投稿者は reservation_id
// 経由でのみ辿れる構造にし、マッサージ師管理画面向けAPIは
// reservations.user_id → users.department_id → departments.name のみを
// 解決して返す（氏名・メールは返さない）。

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reservationId: uuid("reservation_id")
      .notNull()
      .unique()
      .references(() => reservations.id), // 1予約につき1件まで
    rating: smallint("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("reviews_rating_check", sql`${table.rating} BETWEEN 1 AND 5`)]
);

// ---------------------------------------------------------------------------
// notification_settings (通知設定)
// ---------------------------------------------------------------------------

export const notificationSettings = pgTable(
  "notification_settings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    channel: notificationChannelEnum("channel").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    minutesBefore: integer("minutes_before").notNull(), // 既定値：利用者30分／マッサージ師10分
    slackUserId: text("slack_user_id"),
    reservationCreatedEnabled: boolean("reservation_created_enabled").notNull().default(true),
    reservationCancelledEnabled: boolean("reservation_cancelled_enabled").notNull().default(true),
    reminderEnabled: boolean("reminder_enabled").notNull().default(true),
  },
  (table) => [
    index("idx_notification_settings_user_id").on(table.userId),
    uniqueIndex("notification_settings_user_channel_key").on(table.userId, table.channel),
  ]
);

// Slack OAuthで連携したワークスペースと個人ユーザーの対応
export const slackConnections = pgTable(
  "slack_connections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().unique().references(() => users.id),
    slackTeamId: text("slack_team_id").notNull(),
    slackUserId: text("slack_user_id").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_slack_connections_team_user").on(table.slackTeamId, table.slackUserId)]
);

// 配信済み通知（in-app通知の表示元、および外部チャネルの監査ログ）
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id),
    reservationId: uuid("reservation_id").references(() => reservations.id),
    channel: notificationChannelEnum("channel").notNull(),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_notification_deliveries_user_created").on(table.userId, table.createdAt),
    index("idx_notification_deliveries_reservation").on(table.reservationId),
  ]
);
