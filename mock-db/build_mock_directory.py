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

    for employee_code, name, role, gender, dept_name in ACCOUNTS:
        user_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO users (id, employee_code, name, department_id, role, gender, password_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, employee_code, name, dept_ids.get(dept_name), role, gender, password_hash),
        )
        if role == "therapist":
            conn.execute(
                "INSERT INTO therapist_profiles (id, user_id) VALUES (?, ?)",
                (str(uuid.uuid4()), user_id),
            )

    conn.commit()
    conn.close()
    print(f"Built {DB_PATH} with {len(DEPARTMENTS)} departments and {len(ACCOUNTS)} accounts.")


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
