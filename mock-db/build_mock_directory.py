#!/usr/bin/env python3
"""Builds mock-db/mock_directory.sqlite3: a local, dependency-free stand-in for the
PostgreSQL schema in db/schema.sql, seeded with:

  - the test accounts from database-auth-design.md, so the app can be logged into
    locally without a real Postgres server (see mock-db/test-credentials.md)
  - ~52 weeks of synthetic reservation history (rooms, therapist_shifts,
    reservations), so the admin utilization dashboard has real data to aggregate.
    This is explicitly sample data (the dashboard UI labels it as such) — it's
    randomly generated (fixed seed, so re-running reproduces the same numbers) to
    roughly resemble the admin-dashboard-*.html mockups' narrative (田中仁 trending
    up over the last 3 weeks, 佐藤香 lower utilization from working mornings only),
    not a byte-for-byte match of their placeholder figures.

SQLite can't express db/schema.sql's UUID types, enums, or the EXCLUDE USING gist
double-booking constraints (those are exercised against real Postgres — see
db/schema.sql's own header) — this script only needs enough structure to seed and
query the mock directory, so ids are TEXT, enums are CHECK constraints, and
overlapping reservations are merely *avoided* by the generator, not DB-enforced.

Usage:
    python3 mock-db/build_mock_directory.py

Requires: bcrypt (pip install bcrypt)
"""

import datetime
import random
import sqlite3
import uuid
from pathlib import Path

import bcrypt

DB_PATH = Path(__file__).parent / "mock_directory.sqlite3"
TEST_PASSWORD = "Passw0rd!"
SEED = 20260909

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

CREATE TABLE rooms (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE therapist_shifts (
  id            TEXT PRIMARY KEY,
  therapist_id  TEXT NOT NULL REFERENCES therapist_profiles(id),
  work_date     TEXT NOT NULL,
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  UNIQUE (therapist_id, work_date)
);

CREATE TABLE reservations (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  therapist_id      TEXT NOT NULL REFERENCES therapist_profiles(id),
  room_id           TEXT REFERENCES rooms(id),
  reservation_date  TEXT NOT NULL,
  start_time        TEXT NOT NULL,
  end_time          TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')) DEFAULT 'confirmed',
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reservations_therapist_date ON reservations(therapist_id, reservation_date);
CREATE INDEX idx_reservations_user_date ON reservations(user_id, reservation_date);
CREATE INDEX idx_reservations_date_status ON reservations(reservation_date, status);
"""

DEPARTMENTS = ["開発部", "営業部", "総務部", "その他"]
# Relative headcount weight per department — also used to weight which
# department's employees show up more often as reservation-makers, so the
# per-department utilization breakdown ends up naturally uneven rather than
# hand-picked.
DEPARTMENT_WEIGHT = {"開発部": 0.42, "営業部": 0.27, "総務部": 0.18, "その他": 0.13}

ROOMS = ["第1マッサージ室", "第2マッサージ室"]

# (employee_code, name, role, gender, department_name)
NAMED_ACCOUNTS = [
    ("E1001", "佐々木 美咲", "user", "female", "開発部"),
    ("E1002", "山田 洋輔", "user", "male", "総務部"),
    ("E1003", "高橋 直人", "user", "male", "営業部"),
    ("T2001", "田中 仁", "therapist", "male", None),
    ("T2002", "木村 健", "therapist", "male", None),
    ("T2003", "高橋 大輔", "therapist", "male", None),
    ("T2004", "佐藤 香", "therapist", "female", None),
    ("A3001", "鈴木 一郎", "admin", "male", "総務部"),
]

SURNAMES = [
    "伊藤", "渡辺", "中村", "小林", "加藤", "吉田", "山口", "松本", "井上", "林",
    "斎藤", "清水", "森", "池田", "橋本", "阿部", "石川", "前田", "藤田", "後藤",
    "近藤", "村上", "遠藤", "青木", "坂本", "西村", "福田", "太田", "藤井", "三浦",
]
GIVEN_MALE = ["翔太", "大輔", "健太", "陸", "蓮", "悠斗", "颯太", "大和", "陽翔", "樹", "誠", "拓也", "亮", "直樹", "航"]
GIVEN_FEMALE = ["さくら", "美咲", "陽菜", "葵", "結衣", "花子", "由美", "真央", "愛", "千尋", "美穂", "彩", "麻衣", "沙織", "瑞穂"]

AGE_BRACKETS = ["20s", "30s", "40s", "50s_plus"]
AGE_BRACKET_WEIGHT = {"20s": 0.28, "30s": 0.34, "40s": 0.24, "50s_plus": 0.14}

THERAPIST_SPECIALTIES = {
    "T2001": ("肩こり・腰痛", "施術歴8年。前職はスポーツトレーナー。"),
    "T2002": ("首・肩の張り", "施術歴5年。"),
    "T2003": ("腰痛・姿勢改善", "施術歴6年。"),
    "T2004": ("眼精疲労・肩こり", "施術歴4年。午前中心の勤務。"),
}

# Facility hours: each therapist's own shift is a sub-range of 9:00-21:00.
# hour = the start hour of a 1-hour booking slot.
THERAPIST_SHIFTS = {
    "T2001": dict(start=9, end=21, base_util=0.60, recent_boost=0.32),  # trending up
    "T2002": dict(start=9, end=20, base_util=0.60, recent_boost=0.0),
    "T2003": dict(start=9, end=19, base_util=0.56, recent_boost=0.0),
    "T2004": dict(start=9, end=13, base_util=0.50, recent_boost=0.0),  # mornings only
}

# Relative demand per hour-of-day (lunch + evening peaks), used as the base
# shape for booking probability before scaling to each therapist's base_util.
HOUR_WEIGHT = {
    9: 0.35, 10: 0.45, 11: 0.55, 12: 0.70, 13: 0.40, 14: 0.50,
    15: 0.35, 16: 0.30, 17: 0.55, 18: 0.80, 19: 0.92, 20: 0.60,
}

WEEKS_OF_HISTORY = 52


def daterange(start, end):
    d = start
    while d <= end:
        yield d
        d += datetime.timedelta(days=1)


def make_synthetic_users(rng, count):
    """Generates `count` additional (non-test-account) employees for realistic
    reservation volume / attribute-breakdown data."""
    used_names = set()
    users = []
    for _ in range(count):
        gender = rng.choice(["male", "female"])
        given = rng.choice(GIVEN_MALE if gender == "male" else GIVEN_FEMALE)
        name = f"{rng.choice(SURNAMES)} {given}"
        while name in used_names:
            name = f"{rng.choice(SURNAMES)} {given}"
        used_names.add(name)
        department = rng.choices(DEPARTMENTS, weights=[DEPARTMENT_WEIGHT[d] for d in DEPARTMENTS])[0]
        age_bracket = rng.choices(AGE_BRACKETS, weights=[AGE_BRACKET_WEIGHT[a] for a in AGE_BRACKETS])[0]
        users.append({"name": name, "gender": gender, "department": department, "age_bracket": age_bracket})
    return users


def build():
    if DB_PATH.exists():
        DB_PATH.unlink()

    rng = random.Random(SEED)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)

    dept_ids = {name: str(uuid.uuid4()) for name in DEPARTMENTS}
    for name, dept_id in dept_ids.items():
        conn.execute("INSERT INTO departments (id, name) VALUES (?, ?)", (dept_id, name))

    room_ids = [str(uuid.uuid4()) for _ in ROOMS]
    for room_id, name in zip(room_ids, ROOMS):
        conn.execute("INSERT INTO rooms (id, name) VALUES (?, ?)", (room_id, name))

    password_hash = bcrypt.hashpw(TEST_PASSWORD.encode(), bcrypt.gensalt()).decode()

    # -- Named test accounts (users/therapists/admin) --------------------------
    user_ids_by_code = {}
    therapist_profile_id_by_code = {}
    for employee_code, name, role, gender, dept_name in NAMED_ACCOUNTS:
        user_id = str(uuid.uuid4())
        user_ids_by_code[employee_code] = user_id
        age_bracket = rng.choices(AGE_BRACKETS, weights=[AGE_BRACKET_WEIGHT[a] for a in AGE_BRACKETS])[0]
        conn.execute(
            """
            INSERT INTO users (id, employee_code, name, department_id, role, gender, age_bracket, password_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, employee_code, name, dept_ids.get(dept_name), role, gender, age_bracket, password_hash),
        )
        if role == "therapist":
            profile_id = str(uuid.uuid4())
            therapist_profile_id_by_code[employee_code] = profile_id
            specialties, bio = THERAPIST_SPECIALTIES[employee_code]
            conn.execute(
                "INSERT INTO therapist_profiles (id, user_id, specialties, bio) VALUES (?, ?, ?, ?)",
                (profile_id, user_id, specialties, bio),
            )

    # -- Synthetic employees, purely to populate believable reservation volume --
    synthetic_user_ids = []
    for person in make_synthetic_users(rng, count=28):
        user_id = str(uuid.uuid4())
        synthetic_user_ids.append(user_id)
        conn.execute(
            """
            INSERT INTO users (id, employee_code, name, department_id, role, gender, age_bracket, password_hash)
            VALUES (?, ?, ?, ?, 'user', ?, ?, ?)
            """,
            (
                user_id,
                f"E9{len(synthetic_user_ids):03d}",
                person["name"],
                dept_ids[person["department"]],
                person["gender"],
                person["age_bracket"],
                password_hash,
            ),
        )

    all_user_ids = [user_ids_by_code[code] for code, _, role, *_ in NAMED_ACCOUNTS if role == "user"] + synthetic_user_ids
    # ~1/3 of users are "regulars" who get picked ~3x as often, to create repeaters.
    regulars = set(rng.sample(all_user_ids, k=len(all_user_ids) // 3))
    user_weights = [3.0 if uid in regulars else 1.0 for uid in all_user_ids]

    # -- Shifts + reservations ---------------------------------------------------
    today = datetime.date.today()
    start_date = today - datetime.timedelta(weeks=WEEKS_OF_HISTORY)
    # extend through Friday of the current week, so "this week" has a full Mon-Fri
    end_date = today + datetime.timedelta(days=max(0, 4 - today.weekday())) if today.weekday() <= 4 else today

    reservation_rows = []
    shift_rows = []
    room_busy = {}  # (date, hour) -> set of room_ids in use

    for code, cfg in THERAPIST_SHIFTS.items():
        therapist_id = therapist_profile_id_by_code[code]
        hours = list(range(cfg["start"], cfg["end"]))
        mean_weight = sum(HOUR_WEIGHT[h] for h in hours) / len(hours)
        scale = cfg["base_util"] / mean_weight

        for d in daterange(start_date, end_date):
            if d.weekday() >= 5:
                continue  # weekends closed

            shift_rows.append(
                (str(uuid.uuid4()), therapist_id, d.isoformat(), f"{cfg['start']:02d}:00", f"{cfg['end']:02d}:00")
            )

            # Step up over the most recent 3 ISO weeks (not a smooth days-ago ramp,
            # which gets diluted once aggregated into weekly buckets) so a
            # week-by-week trend chart shows a clear, monotonic recent rise.
            weeks_ago = (today - d).days // 7
            recent_factor = 0.0
            if cfg["recent_boost"]:
                if weeks_ago == 0:
                    recent_factor = cfg["recent_boost"]
                elif weeks_ago == 1:
                    recent_factor = cfg["recent_boost"] * 0.7
                elif weeks_ago == 2:
                    recent_factor = cfg["recent_boost"] * 0.4

            for h in hours:
                noise = rng.uniform(-0.08, 0.08)
                p = HOUR_WEIGHT[h] * scale + recent_factor + noise
                p = max(0.0, min(0.97, p))
                if rng.random() >= p:
                    continue

                duration = rng.choice([30, 45])
                start_time = f"{h:02d}:00"
                end_dt = datetime.datetime.combine(d, datetime.time(h, 0)) + datetime.timedelta(minutes=duration)
                end_time = end_dt.strftime("%H:%M")

                busy = room_busy.setdefault((d, h), set())
                available_rooms = [r for r in room_ids if r not in busy]
                room_id = rng.choice(available_rooms) if available_rooms else rng.choice(room_ids)
                busy.add(room_id)

                user_id = rng.choices(all_user_ids, weights=user_weights)[0]
                status = rng.choices(["confirmed", "completed", "cancelled"], weights=[0.15, 0.80, 0.05])[0]

                reservation_rows.append(
                    (
                        str(uuid.uuid4()),
                        user_id,
                        therapist_id,
                        room_id,
                        d.isoformat(),
                        start_time,
                        end_time,
                        status,
                    )
                )

    conn.executemany(
        "INSERT INTO therapist_shifts (id, therapist_id, work_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)",
        shift_rows,
    )
    conn.executemany(
        """
        INSERT INTO reservations
          (id, user_id, therapist_id, room_id, reservation_date, start_time, end_time, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        reservation_rows,
    )

    conn.commit()
    conn.close()
    print(
        f"Built {DB_PATH}: {len(DEPARTMENTS)} departments, {len(NAMED_ACCOUNTS) + len(synthetic_user_ids)} users "
        f"({len(synthetic_user_ids)} synthetic), {len(ROOMS)} rooms, {len(shift_rows)} shifts, "
        f"{len(reservation_rows)} reservations ({start_date} to {end_date})."
    )


def verify():
    """Mirrors the login-check verification described in database-auth-design.md §5."""
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT employee_code, name, role, password_hash FROM users WHERE employee_code NOT LIKE 'E9%' ORDER BY employee_code"
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
