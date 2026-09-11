#!/usr/bin/env python3
"""Builds mock-db/mock_directory.sqlite3: a local, dependency-free stand-in for the
PostgreSQL schema in db/schema.sql, seeded with the test accounts from
database-auth-design.md so the app can be logged into locally without a real
Postgres server.

SQLite can't express db/schema.sql's UUID types, enums, or the EXCLUDE USING gist
double-booking constraints (those are exercised against real Postgres — see
db/schema.sql's own header) — this script only needs enough structure to seed and
authenticate the test directory, so ids are TEXT, enums are CHECK constraints, and
there is no overlap constraint here.

Usage:
    python3 mock-db/build_mock_directory.py

Requires: bcrypt (pip install bcrypt)
"""

import sqlite3
import uuid
from datetime import date, timedelta
from pathlib import Path

import bcrypt

DB_PATH = Path(__file__).parent / "mock_directory.sqlite3"
TEST_PASSWORD = "Passw0rd!"

SCHEMA = """
CREATE TABLE departments (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  employee_code  TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  email          TEXT UNIQUE,
  department_id  TEXT REFERENCES departments(id),
  role           TEXT NOT NULL CHECK (role IN ('user', 'therapist', 'admin')),
  gender         TEXT NOT NULL CHECK (gender IN ('male', 'female', 'unspecified')),
  age_bracket    TEXT CHECK (age_bracket IN ('20s', '30s', '40s', '50s_plus')),
  password_hash  TEXT NOT NULL,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE therapist_profiles (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id),
  specialties TEXT, -- comma-separated (SQLite has no array type)
  bio         TEXT,
  photo_url   TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE therapist_shifts (
  id            TEXT PRIMARY KEY,
  therapist_id  TEXT NOT NULL REFERENCES therapist_profiles(id),
  work_date     TEXT NOT NULL,
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (therapist_id, work_date)
);

CREATE TABLE therapist_breaks (
  id           TEXT PRIMARY KEY,
  shift_id     TEXT NOT NULL REFERENCES therapist_shifts(id),
  break_start  TEXT NOT NULL,
  break_end    TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('break', 'unavailable')) DEFAULT 'break',
  -- Free-text reason, only meaningful for kind='unavailable' ("その他" in the
  -- UI — a plain "不可" gave no clue why, so the therapist can say why).
  label        TEXT
);

CREATE TABLE rooms (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE reservations (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  therapist_id      TEXT NOT NULL REFERENCES therapist_profiles(id),
  room_id           TEXT REFERENCES rooms(id),
  reservation_date  TEXT NOT NULL,
  start_time        TEXT NOT NULL,
  end_time          TEXT NOT NULL,
  requested_note    TEXT,
  status            TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')) DEFAULT 'confirmed',
  cancelled_at      TEXT,
  cancel_reason     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notification_settings (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  channel         TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'slack')),
  enabled         INTEGER NOT NULL DEFAULT 1,
  minutes_before  INTEGER NOT NULL,
  slack_user_id   TEXT
);
"""

DEPARTMENTS = [
    ("開発部",),
    ("営業部",),
    ("総務部",),
    ("その他",),
]

# (employee_code, name, role, gender, department_name)
ACCOUNTS = [
    ("E1001", "佐々木 美咲", "user", "female", "開発部"),
    ("E1002", "山田 洋輔", "user", "male", "総務部"),
    ("E1003", "高橋 直人", "user", "male", "営業部"),
    ("T2001", "田中 仁", "therapist", "male", None),
    ("T2002", "木村 健", "therapist", "male", None),
    ("T2003", "高橋 大輔", "therapist", "male", None),
    ("T2004", "佐藤 香", "therapist", "female", None),
    ("A3001", "鈴木 一郎", "admin", "male", "総務部"),
]

ROOMS = ["ベッドA", "ベッドB", "ベッドC"]

# Sample reservations for T2002 (木村健), mirroring
# design/therapist-bookings-desktop.html. day_offset is relative to the date the
# script is run (0 = today, matching the app's "今日/明日" tabs).
RESERVATIONS = [
    # (therapist_employee_code, client_employee_code, day_offset, start_time, end_time, note)
    ("T2002", "E1002", 0, "09:00", "09:30", None),
    ("T2002", "E1001", 0, "12:00", "12:45", "肩と首の張りが強い。デスクワーク中心。"),
    ("T2002", "E1003", 0, "19:00", "19:45", "腰が重い。長時間の立ち仕事が続いている。"),
    # Up-to-2-per-hour case: each reservation is a 15-min treatment (the
    # shortest user-selectable duration) plus the mandatory 15-min post-use
    # cleaning, so two fit back to back inside one hour without overlapping:
    # 15:00-15:15 treat, 15:15-15:30 clean, 15:30-15:45 treat, 15:45-16:00 clean.
    ("T2002", "E1001", 0, "15:00", "15:15", None),
    ("T2002", "E1002", 0, "15:30", "15:45", None),
    ("T2002", "E1003", 1, "10:00", "10:30", None),
    ("T2002", "E1002", 1, "15:00", "15:45", None),
]

# (employee_code, channel, minutes_before) — defaults per database-auth-design.md §6
NOTIFICATION_DEFAULTS = {
    "user": ("in_app", 30),
    "therapist": ("slack", 10),
    "admin": ("in_app", 30),
}


def build():
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)

    dept_ids = {}
    for (name,) in DEPARTMENTS:
        dept_id = str(uuid.uuid4())
        dept_ids[name] = dept_id
        conn.execute("INSERT INTO departments (id, name) VALUES (?, ?)", (dept_id, name))

    password_hash = bcrypt.hashpw(TEST_PASSWORD.encode(), bcrypt.gensalt()).decode()

    user_ids = {}
    therapist_profile_ids = {}
    for employee_code, name, role, gender, dept_name in ACCOUNTS:
        user_id = str(uuid.uuid4())
        user_ids[employee_code] = user_id
        conn.execute(
            """
            INSERT INTO users (id, employee_code, name, department_id, role, gender, password_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, employee_code, name, dept_ids.get(dept_name), role, gender, password_hash),
        )
        if role == "therapist":
            therapist_profile_id = str(uuid.uuid4())
            therapist_profile_ids[employee_code] = therapist_profile_id
            conn.execute(
                "INSERT INTO therapist_profiles (id, user_id) VALUES (?, ?)",
                (therapist_profile_id, user_id),
            )

        channel, minutes_before = NOTIFICATION_DEFAULTS[role]
        conn.execute(
            "INSERT INTO notification_settings (id, user_id, channel, minutes_before) VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), user_id, channel, minutes_before),
        )

    room_ids = []
    for name in ROOMS:
        room_id = str(uuid.uuid4())
        room_ids.append(room_id)
        conn.execute("INSERT INTO rooms (id, name) VALUES (?, ?)", (room_id, name))

    for i, (therapist_code, client_code, day_offset, start_time, end_time, note) in enumerate(RESERVATIONS):
        reservation_date = (date.today() + timedelta(days=day_offset)).isoformat()
        conn.execute(
            """
            INSERT INTO reservations
              (id, user_id, therapist_id, room_id, reservation_date, start_time, end_time, requested_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                user_ids[client_code],
                therapist_profile_ids[therapist_code],
                room_ids[i % len(room_ids)],
                reservation_date,
                start_time,
                end_time,
                note,
            ),
        )

    conn.commit()
    conn.close()
    print(
        f"Built {DB_PATH} with {len(DEPARTMENTS)} departments, {len(ACCOUNTS)} accounts, "
        f"{len(ROOMS)} rooms, and {len(RESERVATIONS)} reservations."
    )


def verify():
    """Mirrors the login-check verification described in database-auth-design.md §5."""
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT employee_code, name, role, password_hash FROM users ORDER BY employee_code"
    ).fetchall()
    conn.close()

    all_ok = True
    for employee_code, name, role, password_hash in rows:
        ok = bcrypt.checkpw(TEST_PASSWORD.encode(), password_hash.encode())
        all_ok = all_ok and ok
        print(f"{employee_code:<8} {name:<10} {role:<10} {'OK' if ok else 'FAIL'}")

    print(f"{sum(1 for *_ , h in rows if bcrypt.checkpw(TEST_PASSWORD.encode(), h.encode()))}/{len(rows)} 件のアカウントでログイン検証が成功しました。")

    wrong_password_ok = bcrypt.checkpw(b"wrong-password", rows[0][3].encode())
    print(f"誤ったパスワードでの検証(false になるべき): {wrong_password_ok}")
    assert all_ok, "one or more test accounts failed bcrypt verification"
    assert not wrong_password_ok, "wrong password incorrectly verified as correct"


if __name__ == "__main__":
    build()
    verify()
