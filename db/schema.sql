-- マッサマン (Massage Manager) — PostgreSQL schema
--
-- Historical record of the original schema design. The implementation's actual
-- source of truth is now src/db/schema.ts (Drizzle ORM) — see
-- docs/superpowers/specs/2026-09-10-postgres-migration-design.md. This file is
-- no longer applied directly (drizzle-kit generates the real migrations under
-- drizzle/); kept here so the original design rationale stays discoverable.
--
-- Implements the design decided in database-auth-design.md:
--   - employee-ID + bcrypt-hashed password auth, cookie session (app-layer, not in this schema)
--   - double-booking prevention via DB-level exclusion constraints (not app-code checks)
--   - anonymity rule: DB always holds full data; masking happens in the API response layer

BEGIN;

-- Required for gen_random_uuid() and for EXCLUDE constraints that mix an
-- equality column (therapist_id / room_id) with a range column (via &&).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('user', 'therapist', 'admin');
CREATE TYPE gender AS ENUM ('male', 'female', 'unspecified');
CREATE TYPE age_bracket AS ENUM ('20s', '30s', '40s', '50s_plus');
CREATE TYPE reservation_status AS ENUM ('confirmed', 'cancelled', 'completed', 'no_show');
CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'slack');

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------

CREATE TABLE departments (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL -- 開発部／営業部／総務部／その他
);

-- ---------------------------------------------------------------------------
-- users (利用者・マッサージ師・管理者 共通)
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code  text NOT NULL UNIQUE,        -- 社員ID（ログインに使用）
  name           text NOT NULL,
  email          text UNIQUE,                 -- ログインには使用しないため null を許可
  department_id  uuid REFERENCES departments(id),
  role           user_role NOT NULL,
  gender         gender NOT NULL,
  age_bracket    age_bracket,                 -- 生年月日は保持しない（プライバシー最小化）
  password_hash  text NOT NULL,               -- bcrypt ハッシュ
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_department_id ON users(department_id);

-- ---------------------------------------------------------------------------
-- therapist_profiles (マッサージ師属性)
-- ---------------------------------------------------------------------------

CREATE TABLE therapist_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES users(id),
  specialties text[],  -- 得意分野（肩こり・腰痛 等）
  bio         text,    -- 経歴（施術歴・前職・保有資格など）
  photo_url   text,
  is_active   boolean NOT NULL DEFAULT true -- 休職中等に false
);

-- ---------------------------------------------------------------------------
-- therapist_shifts (勤務時間登録)
-- ---------------------------------------------------------------------------

CREATE TABLE therapist_shifts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id  uuid NOT NULL REFERENCES therapist_profiles(id),
  work_date     date NOT NULL,
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (therapist_id, work_date) -- 1日1レンジ。休憩は別テーブルで表現
);

-- ---------------------------------------------------------------------------
-- therapist_breaks (休憩時間)
-- ---------------------------------------------------------------------------

CREATE TABLE therapist_breaks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id     uuid NOT NULL REFERENCES therapist_shifts(id),
  break_start  time NOT NULL,
  break_end    time NOT NULL
);

CREATE INDEX idx_therapist_breaks_shift_id ON therapist_breaks(shift_id);

-- ---------------------------------------------------------------------------
-- rooms (施術室)
-- ---------------------------------------------------------------------------

CREATE TABLE rooms (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL -- 第1マッサージ室／第2マッサージ室
);

-- ---------------------------------------------------------------------------
-- reservations (予約) — 最重要テーブル
-- ---------------------------------------------------------------------------

CREATE TABLE reservations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id),
  therapist_id      uuid NOT NULL REFERENCES therapist_profiles(id),
  room_id           uuid REFERENCES rooms(id), -- 空いている部屋を予約時に自動割当
  reservation_date  date NOT NULL,
  start_time        time NOT NULL,
  end_time          time NOT NULL,             -- 1〜45分の範囲。start_timeとの差分がduration
  requested_note    text,                      -- 施術部位・伝えたいこと
  status            reservation_status NOT NULL DEFAULT 'confirmed',
  cancelled_at      timestamptz,
  cancel_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 二重予約防止（最重要制約）: 空き状況確認と予約確定の間のrace conditionを
-- アプリケーションコードのチェックだけに頼らず、DB制約で機械的にブロックする。
-- status = 'confirmed' の予約だけを対象とするため、キャンセル済み予約は
-- 同じ枠への再予約を妨げない。

-- 同一マッサージ師の予約時間帯の重複を禁止
ALTER TABLE reservations ADD CONSTRAINT no_overlap_per_therapist
EXCLUDE USING gist (
  therapist_id WITH =,
  tsrange(
    (reservation_date + start_time)::timestamp,
    (reservation_date + end_time)::timestamp,
    '[)'
  ) WITH &&
) WHERE (status = 'confirmed');

-- 部屋が2室しかないため、部屋の二重利用も同様に防止
ALTER TABLE reservations ADD CONSTRAINT no_overlap_per_room
EXCLUDE USING gist (
  room_id WITH =,
  tsrange(
    (reservation_date + start_time)::timestamp,
    (reservation_date + end_time)::timestamp,
    '[)'
  ) WITH &&
) WHERE (status = 'confirmed' AND room_id IS NOT NULL);

-- インデックス方針（カレンダー表示・履歴表示・利用率ダッシュボードの高速化）
CREATE INDEX idx_reservations_therapist_date ON reservations(therapist_id, reservation_date);
CREATE INDEX idx_reservations_user_date ON reservations(user_id, reservation_date);
CREATE INDEX idx_reservations_date_status ON reservations(reservation_date, status);

-- ---------------------------------------------------------------------------
-- reviews (口コミ)
-- ---------------------------------------------------------------------------
--
-- 匿名性: このテーブル自体に user_id は持たせない。投稿者は reservation_id
-- 経由でのみ辿れる構造にし、マッサージ師管理画面向けAPIは
-- reservations.user_id → users.department_id → departments.name のみを
-- 解決して返す（氏名・メールは返さない）。

CREATE TABLE reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  uuid NOT NULL UNIQUE REFERENCES reservations(id), -- 1予約につき1件まで
  rating          smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- notification_settings (通知設定)
-- ---------------------------------------------------------------------------

CREATE TABLE notification_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  channel         notification_channel NOT NULL,
  enabled         boolean NOT NULL DEFAULT true,
  minutes_before  int NOT NULL, -- 既定値：利用者30分／マッサージ師10分
  slack_user_id   text,
  reservation_created_enabled boolean NOT NULL DEFAULT true,
  reservation_cancelled_enabled boolean NOT NULL DEFAULT true,
  reminder_enabled boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_notification_settings_user_id ON notification_settings(user_id);
CREATE UNIQUE INDEX notification_settings_user_channel_key ON notification_settings(user_id, channel);

-- ---------------------------------------------------------------------------
-- notification_deliveries (通知配信履歴)
-- ---------------------------------------------------------------------------

CREATE TABLE notification_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  reservation_id  uuid REFERENCES reservations(id),
  channel         notification_channel NOT NULL,
  event_type      text NOT NULL,
  title           text NOT NULL,
  body            text NOT NULL,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_deliveries_user_created
  ON notification_deliveries(user_id, created_at);
CREATE INDEX idx_notification_deliveries_reservation
  ON notification_deliveries(reservation_id);

-- ---------------------------------------------------------------------------
-- slack_connections (Slack OAuth連携)
-- ---------------------------------------------------------------------------

CREATE TABLE slack_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES users(id),
  slack_team_id   text NOT NULL,
  slack_user_id   text NOT NULL,
  connected_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_slack_connections_team_user
  ON slack_connections(slack_team_id, slack_user_id);

COMMIT;
