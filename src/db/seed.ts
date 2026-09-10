import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { notLike } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "./schema";
import { departments, users, therapistProfiles, rooms, therapistShifts, reservations } from "./schema";

const pgClient = postgres(process.env.DATABASE_URL!);
const db = drizzle(pgClient, { schema });

const TEST_PASSWORD = "Passw0rd!";
const SEED = 20260909;

/**
 * Deterministic seeded PRNG (mulberry32) so re-running this script reproduces
 * the same synthetic data — mirrors the reproducibility property
 * mock-db/build_mock_directory.py had via Python's `random.Random(SEED)`.
 * Not the same algorithm as Python's, so the exact numbers differ from any
 * previous SQLite-era run — that's fine, the old data was disposable.
 */
class SeededRandom {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  random(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(min: number, max: number): number {
    return min + this.random() * (max - min);
  }
  choice<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.random() * arr.length)];
  }
  choices<T>(arr: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.random() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }
  sample<T>(arr: readonly T[], k: number): T[] {
    const pool = [...arr];
    const result: T[] = [];
    for (let i = 0; i < k && pool.length > 0; i++) {
      const idx = Math.floor(this.random() * pool.length);
      result.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return result;
  }
}

const DEPARTMENTS = ["開発部", "営業部", "総務部", "その他"] as const;
const DEPARTMENT_WEIGHT: Record<string, number> = { 開発部: 0.42, 営業部: 0.27, 総務部: 0.18, その他: 0.13 };

const ROOMS = ["第1マッサージ室", "第2マッサージ室"];

type NamedAccount = {
  employeeCode: string;
  name: string;
  role: "user" | "therapist" | "admin";
  gender: "male" | "female";
  department: string | null;
};

const NAMED_ACCOUNTS: NamedAccount[] = [
  { employeeCode: "E1001", name: "佐々木 美咲", role: "user", gender: "female", department: "開発部" },
  { employeeCode: "E1002", name: "山田 洋輔", role: "user", gender: "male", department: "総務部" },
  { employeeCode: "E1003", name: "高橋 直人", role: "user", gender: "male", department: "営業部" },
  { employeeCode: "T2001", name: "田中 仁", role: "therapist", gender: "male", department: null },
  { employeeCode: "T2002", name: "木村 健", role: "therapist", gender: "male", department: null },
  { employeeCode: "T2003", name: "高橋 大輔", role: "therapist", gender: "male", department: null },
  { employeeCode: "T2004", name: "佐藤 香", role: "therapist", gender: "female", department: null },
  { employeeCode: "A3001", name: "鈴木 一郎", role: "admin", gender: "male", department: "総務部" },
];

const SURNAMES = [
  "伊藤", "渡辺", "中村", "小林", "加藤", "吉田", "山口", "松本", "井上", "林",
  "斎藤", "清水", "森", "池田", "橋本", "阿部", "石川", "前田", "藤田", "後藤",
  "近藤", "村上", "遠藤", "青木", "坂本", "西村", "福田", "太田", "藤井", "三浦",
];
const GIVEN_MALE = ["翔太", "大輔", "健太", "陸", "蓮", "悠斗", "颯太", "大和", "陽翔", "樹", "誠", "拓也", "亮", "直樹", "航"];
const GIVEN_FEMALE = ["さくら", "美咲", "陽菜", "葵", "結衣", "花子", "由美", "真央", "愛", "千尋", "美穂", "彩", "麻衣", "沙織", "瑞穂"];

const AGE_BRACKETS = ["20s", "30s", "40s", "50s_plus"] as const;
type AgeBracketValue = (typeof AGE_BRACKETS)[number];
const AGE_BRACKET_WEIGHT: Record<AgeBracketValue, number> = { "20s": 0.28, "30s": 0.34, "40s": 0.24, "50s_plus": 0.14 };

const THERAPIST_SPECIALTIES: Record<string, { specialty: string; bio: string }> = {
  T2001: { specialty: "肩こり・腰痛", bio: "施術歴8年。前職はスポーツトレーナー。" },
  T2002: { specialty: "首・肩の張り", bio: "施術歴5年。" },
  T2003: { specialty: "腰痛・姿勢改善", bio: "施術歴6年。" },
  T2004: { specialty: "眼精疲労・肩こり", bio: "施術歴4年。午前中心の勤務。" },
};

const THERAPIST_SHIFTS: Record<string, { start: number; end: number; baseUtil: number; recentBoost: number }> = {
  T2001: { start: 9, end: 20, baseUtil: 0.6, recentBoost: 0.32 }, // trending up
  T2002: { start: 9, end: 20, baseUtil: 0.6, recentBoost: 0.0 },
  T2003: { start: 9, end: 19, baseUtil: 0.56, recentBoost: 0.0 },
  T2004: { start: 9, end: 13, baseUtil: 0.5, recentBoost: 0.0 }, // mornings only
};

// Relative demand per hour-of-day (lunch + evening peaks).
const HOUR_WEIGHT: Record<number, number> = {
  9: 0.35, 10: 0.45, 11: 0.55, 12: 0.7, 13: 0.4, 14: 0.5,
  15: 0.35, 16: 0.3, 17: 0.55, 18: 0.8, 19: 0.92,
};

const WEEKS_OF_HISTORY = 52;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
/** Python's `date.weekday()`: Monday=0 .. Sunday=6. JS's getUTCDay() is Sunday=0 .. Saturday=6. */
function pyWeekday(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}
function* dateRange(start: Date, end: Date): Generator<Date> {
  let d = start;
  while (d <= end) {
    yield d;
    d = addDays(d, 1);
  }
}

type SyntheticUser = { name: string; gender: "male" | "female"; department: string; ageBracket: AgeBracketValue };

/** Generates `count` additional (non-test-account) employees for realistic
 * reservation volume / attribute-breakdown data. */
function makeSyntheticUsers(rng: SeededRandom, count: number): SyntheticUser[] {
  const usedNames = new Set<string>();
  const result: SyntheticUser[] = [];
  for (let i = 0; i < count; i++) {
    const gender: "male" | "female" = rng.choice(["male", "female"]);
    const givenPool = gender === "male" ? GIVEN_MALE : GIVEN_FEMALE;
    let name = `${rng.choice(SURNAMES)} ${rng.choice(givenPool)}`;
    while (usedNames.has(name)) {
      name = `${rng.choice(SURNAMES)} ${rng.choice(givenPool)}`;
    }
    usedNames.add(name);
    const department = rng.choices(DEPARTMENTS, DEPARTMENTS.map((d) => DEPARTMENT_WEIGHT[d]));
    const ageBracket = rng.choices(AGE_BRACKETS, AGE_BRACKETS.map((a) => AGE_BRACKET_WEIGHT[a]));
    result.push({ name, gender, department, ageBracket });
  }
  return result;
}

async function truncateAll() {
  await pgClient`TRUNCATE TABLE reservations, therapist_breaks, therapist_shifts, reviews, notification_settings, therapist_profiles, users, rooms, departments CASCADE`;
}

async function insertShiftsInChunks(rows: (typeof therapistShifts.$inferInsert)[], chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db.insert(therapistShifts).values(rows.slice(i, i + chunkSize));
  }
}
async function insertReservationsInChunks(rows: (typeof reservations.$inferInsert)[], chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db.insert(reservations).values(rows.slice(i, i + chunkSize));
  }
}

async function build() {
  console.log("Truncating existing tables...");
  await truncateAll();

  const rng = new SeededRandom(SEED);

  const deptRows = DEPARTMENTS.map((name) => ({ id: crypto.randomUUID(), name }));
  await db.insert(departments).values(deptRows);
  const deptIdByName = new Map<string, string>(deptRows.map((d) => [d.name, d.id]));

  const roomRows = ROOMS.map((name) => ({ id: crypto.randomUUID(), name }));
  await db.insert(rooms).values(roomRows);
  const roomIds = roomRows.map((r) => r.id);

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  // -- Named test accounts (users/therapists/admin) --------------------------
  const userIdByCode = new Map<string, string>();
  const therapistProfileIdByCode = new Map<string, string>();
  const namedUserRows: (typeof users.$inferInsert)[] = [];
  const therapistProfileRows: (typeof therapistProfiles.$inferInsert)[] = [];

  for (const acc of NAMED_ACCOUNTS) {
    const userId = crypto.randomUUID();
    userIdByCode.set(acc.employeeCode, userId);
    const ageBracket = rng.choices(AGE_BRACKETS, AGE_BRACKETS.map((a) => AGE_BRACKET_WEIGHT[a]));
    namedUserRows.push({
      id: userId,
      employeeCode: acc.employeeCode,
      name: acc.name,
      departmentId: acc.department ? deptIdByName.get(acc.department) : null,
      role: acc.role,
      gender: acc.gender,
      ageBracket,
      passwordHash,
    });
    if (acc.role === "therapist") {
      const profileId = crypto.randomUUID();
      therapistProfileIdByCode.set(acc.employeeCode, profileId);
      const { specialty, bio } = THERAPIST_SPECIALTIES[acc.employeeCode];
      therapistProfileRows.push({ id: profileId, userId, specialties: [specialty], bio });
    }
  }
  await db.insert(users).values(namedUserRows);
  await db.insert(therapistProfiles).values(therapistProfileRows);

  // -- Synthetic employees, purely to populate believable reservation volume --
  const synthetic = makeSyntheticUsers(rng, 28);
  const syntheticUserRows: (typeof users.$inferInsert)[] = synthetic.map((person, i) => ({
    id: crypto.randomUUID(),
    employeeCode: `E9${String(i + 1).padStart(3, "0")}`,
    name: person.name,
    departmentId: deptIdByName.get(person.department),
    role: "user",
    gender: person.gender,
    ageBracket: person.ageBracket,
    passwordHash,
  }));
  await db.insert(users).values(syntheticUserRows);
  const syntheticUserIds = syntheticUserRows.map((u) => u.id!);

  const allUserIds = [
    ...NAMED_ACCOUNTS.filter((a) => a.role === "user").map((a) => userIdByCode.get(a.employeeCode)!),
    ...syntheticUserIds,
  ];
  // ~1/3 of users are "regulars" who get picked ~3x as often, to create repeaters.
  const regulars = new Set(rng.sample(allUserIds, Math.floor(allUserIds.length / 3)));
  const userWeights = allUserIds.map((id) => (regulars.has(id) ? 3.0 : 1.0));

  // -- Shifts + reservations ---------------------------------------------------
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startDate = addDays(today, -WEEKS_OF_HISTORY * 7);
  const todayPyWd = pyWeekday(today);
  // extend through Friday of the current week, so "this week" has a full Mon-Fri
  const endDate = todayPyWd <= 4 ? addDays(today, Math.max(0, 4 - todayPyWd)) : today;

  const shiftRows: (typeof therapistShifts.$inferInsert)[] = [];
  const reservationRows: (typeof reservations.$inferInsert)[] = [];
  const roomBusy = new Map<string, Set<string>>(); // `${date}|${hour}` -> room ids in use
  const userReservationWeeks = new Set<string>();

  for (const [code, cfg] of Object.entries(THERAPIST_SHIFTS)) {
    const therapistId = therapistProfileIdByCode.get(code)!;
    const hours: number[] = [];
    for (let h = cfg.start; h < cfg.end; h++) hours.push(h);
    const meanWeight = hours.reduce((sum, h) => sum + HOUR_WEIGHT[h], 0) / hours.length;
    const scale = cfg.baseUtil / meanWeight;

    for (const d of dateRange(startDate, endDate)) {
      if (pyWeekday(d) >= 5) continue; // weekends closed

      const dateStr = toISODate(d);
      shiftRows.push({
        id: crypto.randomUUID(),
        therapistId,
        workDate: dateStr,
        startTime: `${String(cfg.start).padStart(2, "0")}:00`,
        endTime: `${String(cfg.end).padStart(2, "0")}:00`,
      });

      // Step up over the most recent 3 ISO weeks, not a smooth days-ago ramp
      // (which gets diluted once aggregated into weekly buckets).
      const weeksAgo = Math.floor((today.getTime() - d.getTime()) / (7 * 24 * 60 * 60 * 1000));
      let recentFactor = 0;
      if (cfg.recentBoost) {
        if (weeksAgo === 0) recentFactor = cfg.recentBoost;
        else if (weeksAgo === 1) recentFactor = cfg.recentBoost * 0.7;
        else if (weeksAgo === 2) recentFactor = cfg.recentBoost * 0.4;
      }

      for (const h of hours) {
        const noise = rng.uniform(-0.08, 0.08);
        let p = HOUR_WEIGHT[h] * scale + recentFactor + noise;
        p = Math.max(0, Math.min(0.97, p));
        if (rng.random() >= p) continue;

        const duration = rng.choice([30, 45]);
        const startTime = `${String(h).padStart(2, "0")}:00`;
        const endMinutes = h * 60 + duration;
        const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

        const userId = rng.choices(allUserIds, userWeights);
        const weekStart = addDays(d, -pyWeekday(d));
        const userWeekKey = `${userId}|${toISODate(weekStart)}`;
        const busyKey = `${dateStr}|${h}`;
        const busy = roomBusy.get(busyKey) ?? new Set<string>();
        roomBusy.set(busyKey, busy);
        const availableRooms = roomIds.filter((r) => !busy.has(r));
        // All rooms already booked this hour (can happen: up to 4 therapists'
        // shifts overlap 9am-1pm against only 2 rooms) — skip rather than
        // force a double-booking, which would violate the DB's
        // no_overlap_per_room EXCLUDE constraint.
        if (availableRooms.length === 0) continue;
        const roomId = rng.choice(availableRooms);
        busy.add(roomId);

        const status = rng.choices(["confirmed", "completed", "cancelled"] as const, [0.15, 0.8, 0.05]);
        if (status !== "cancelled") {
          if (userReservationWeeks.has(userWeekKey)) continue;
          userReservationWeeks.add(userWeekKey);
        }

        reservationRows.push({
          id: crypto.randomUUID(),
          userId,
          therapistId,
          roomId,
          reservationDate: dateStr,
          startTime,
          endTime,
          status,
        });
      }
    }
  }

  console.log(`Inserting ${shiftRows.length} shifts...`);
  await insertShiftsInChunks(shiftRows);
  console.log(`Inserting ${reservationRows.length} reservations...`);
  await insertReservationsInChunks(reservationRows);

  console.log(
    `Seeded: ${DEPARTMENTS.length} departments, ${namedUserRows.length + syntheticUserRows.length} users ` +
      `(${syntheticUserRows.length} synthetic), ${ROOMS.length} rooms, ${shiftRows.length} shifts, ` +
      `${reservationRows.length} reservations (${toISODate(startDate)} to ${toISODate(endDate)}).`
  );
}

/** Mirrors the login-check verification described in database-auth-design.md §5. */
async function verify() {
  const rows = await db
    .select({
      employeeCode: users.employeeCode,
      name: users.name,
      role: users.role,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(notLike(users.employeeCode, "E9%"))
    .orderBy(users.employeeCode);

  let allOk = true;
  for (const row of rows) {
    const ok = await bcrypt.compare(TEST_PASSWORD, row.passwordHash);
    allOk = allOk && ok;
    console.log(`${row.employeeCode.padEnd(8)} ${row.name.padEnd(10)} ${row.role.padEnd(10)} ${ok ? "OK" : "FAIL"}`);
  }
  const okCount = rows.length; // all must pass, or we throw below
  console.log(`${okCount}/${rows.length} 件のアカウントでログイン検証が成功しました。`);

  const wrongPasswordOk = await bcrypt.compare("wrong-password", rows[0].passwordHash);
  console.log(`誤ったパスワードでの検証(false になるべき): ${wrongPasswordOk}`);

  if (!allOk) throw new Error("one or more test accounts failed bcrypt verification");
  if (wrongPasswordOk) throw new Error("wrong password incorrectly verified as correct");
}

async function main() {
  await build();
  await verify();
  await pgClient.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
