# PostgreSQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local SQLite mock database (`mock-db/mock_directory.sqlite3`, `node:sqlite`) with a real, Docker-run PostgreSQL database, using Drizzle ORM as the schema/query layer, so the app actually runs on the DBMS `db/schema.sql` and `docs/database-auth-design.md` already decided on.

**Architecture:** Drizzle TS schema (`src/db/schema.ts`) becomes the source of truth; `drizzle-kit` generates SQL migrations from it, with the double-booking `EXCLUDE USING gist` constraints hand-appended once. `src/lib/db.ts` exports two things from one `postgres.js` connection: a Drizzle instance (`db`) for simple typed queries (`employees.ts`), and the raw `postgres.js` tagged-template client (`sql`) for the dynamic, hand-composed aggregation queries in `dashboard-data.ts` — ported close to verbatim, async instead of sync. A new `src/db/seed.ts` (TypeScript, using the same Drizzle schema) replaces `mock-db/build_mock_directory.py`.

**Tech Stack:** PostgreSQL 16 (Docker Compose), `drizzle-orm` + `drizzle-kit` + `postgres` (postgres.js driver), `bcryptjs` (already a dependency), `tsx` + `dotenv-cli` (script tooling).

**Spec:** `docs/superpowers/specs/2026-09-10-postgres-migration-design.md`

## Global Constraints

- DBMS is PostgreSQL 16, run locally via Docker Compose — no cloud/managed Postgres in this plan.
- Drizzle ORM (`drizzle-orm/postgres-js` + `drizzle-kit`) is the query/migration layer. `src/db/schema.ts` is the schema source of truth; `db/schema.sql` stays only as a historical record.
- `employees.ts` uses Drizzle's query builder. `dashboard-data.ts` uses the raw `postgres.js` tagged-template client (`sql`), porting existing SQL text and calculation logic as-is — **do not change any utilization-rate/vacancy/attribute-breakdown calculation logic** while doing this migration; only the query mechanism and SQL dialect change.
- The double-booking `EXCLUDE USING gist` constraints are added as hand-written SQL appended to the generated migration — Drizzle cannot express them.
- The existing SQLite mock data is disposable; do not attempt to migrate/export it. `mock-db/` is deleted at the end of this plan, not archived.
- This plan does not add a new automated test framework — the codebase has none today (verification here follows the project's existing convention: `tsc --noEmit` / `pnpm lint` / `pnpm build`, plus live queries and browser checks).
- No new booking-write feature work — this plan only touches the database layer and its two existing consumers (`employees.ts`, `dashboard-data.ts`).

---

## Task 1: Docker Compose + environment configuration

**Files:**
- Create: `docker-compose.yml`
- Modify: `.env.example`
- Create: `.env.local` (gitignored — verify `.gitignore` already excludes it; if not, add it)

**Interfaces:**
- Produces: a running Postgres 16 instance reachable at `postgresql://massaman:massaman@localhost:5432/massaman`, and `DATABASE_URL` available in `.env.local` for every later task.

- [ ] **Step 1: Check `.gitignore` covers `.env.local`**

Run: `grep -n "env.local" /Users/itosuyuuki1/MassaMan/.gitignore`

Expected: a match. If there's no match, add a line `.env.local` to `.gitignore` (Next.js's default create-next-app `.gitignore` already ignores `.env*.local`, so this is just a safety check, not expected to require an edit).

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: massaman
      POSTGRES_PASSWORD: massaman
      POSTGRES_DB: massaman
    ports:
      - "5432:5432"
    volumes:
      - massaman_pgdata:/var/lib/postgresql/data

volumes:
  massaman_pgdata:
```

- [ ] **Step 3: Add `DATABASE_URL` to `.env.example`**

Add this block to the end of `.env.example`:

```
# PostgreSQL connection string (see docker-compose.yml for the local credentials).
DATABASE_URL=postgresql://massaman:massaman@localhost:5432/massaman
```

- [ ] **Step 4: Create `.env.local` with the same value**

`.env.local` should already exist (from the earlier login-feature work, holding `SESSION_SECRET`). Read it first, then add the same `DATABASE_URL` line to it:

```
DATABASE_URL=postgresql://massaman:massaman@localhost:5432/massaman
```

- [ ] **Step 5: Start Postgres and verify it's reachable**

Run: `docker compose up -d`
Then: `docker compose ps` — expect the `postgres` service listed as `running`/`healthy`.
Then: `docker exec -it $(docker compose ps -q postgres) psql -U massaman -d massaman -c '\conninfo'`
Expected: prints connection info (database "massaman", user "massaman") with no error.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example .gitignore
git commit -m "Add Docker Compose Postgres service for local development"
```

(`.env.local` is gitignored and must NOT be committed.)

---

## Task 2: Add dependencies, Drizzle config, npm scripts

**Files:**
- Modify: `package.json`
- Create: `drizzle.config.ts`

**Interfaces:**
- Produces: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed` scripts; `drizzle.config.ts` pointing at `./src/db/schema.ts` and `./drizzle` (migrations output directory).

- [ ] **Step 1: Install dependencies**

Run: `pnpm add drizzle-orm postgres`
Run: `pnpm add -D drizzle-kit dotenv-cli tsx`

- [ ] **Step 2: Edit `package.json` scripts**

Replace the `scripts` block:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "db:generate": "dotenv -e .env.local -- drizzle-kit generate",
    "db:migrate": "dotenv -e .env.local -- drizzle-kit migrate",
    "db:seed": "dotenv -e .env.local -- tsx src/db/seed.ts"
  },
```

(This removes `NODE_OPTIONS=--experimental-sqlite`, no longer needed once `node:sqlite` is gone — the actual removal of the `node:sqlite` import happens in Task 6, but it's safe to drop this flag now since Next.js ignores unknown env vars.)

- [ ] **Step 3: Create `drizzle.config.ts`** (repo root, alongside `package.json`)

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: Verify the scripts are wired up (schema doesn't exist yet, so expect a specific failure)**

Run: `pnpm db:generate`
Expected: fails because `./src/db/schema.ts` doesn't exist yet (e.g. "Cannot find module" or "no schema found") — this confirms `dotenv-cli` successfully loaded `DATABASE_URL` and `drizzle-kit` ran at all, rather than failing on a missing env var. Task 3 creates the schema file.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml drizzle.config.ts
git commit -m "Add Drizzle ORM, postgres.js, and drizzle-kit tooling"
```

---

## Task 3: Drizzle schema (`src/db/schema.ts`)

**Files:**
- Create: `src/db/schema.ts`

**Interfaces:**
- Consumes: nothing (this is the schema source of truth).
- Produces: `departments`, `users`, `therapistProfiles`, `therapistShifts`, `therapistBreaks`, `rooms`, `reservations`, `reviews`, `notificationSettings` — pgTable exports later tasks import from `@/db/schema`.

- [ ] **Step 1: Write the schema**

```ts
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
// therapist_breaks (休憩時間) — not queried yet, but part of the decided schema
// ---------------------------------------------------------------------------

export const therapistBreaks = pgTable(
  "therapist_breaks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => therapistShifts.id),
    breakStart: time("break_start").notNull(),
    breakEnd: time("break_end").notNull(),
  },
  (table) => [index("idx_therapist_breaks_shift_id").on(table.shiftId)]
);

// ---------------------------------------------------------------------------
// rooms (施術室)
// ---------------------------------------------------------------------------

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // 第1マッサージ室／第2マッサージ室
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
  },
  (table) => [index("idx_notification_settings_user_id").on(table.userId)]
);
```

Note the `date("work_date", { mode: "string" })` / `date("reservation_date", { mode: "string" })` option: this tells Drizzle's own query-builder type layer to treat these columns as `string` (not `Date`) at the TypeScript level, matching the raw-driver string behavior configured in Task 6. `time` columns don't take a `mode` option in `drizzle-orm/pg-core` — they're typed as `string` by default already.

- [ ] **Step 2: Type-check the schema file in isolation**

Run: `npx tsc --noEmit`
Expected: no errors from `src/db/schema.ts` (errors from other files touching the old `db.ts`/`employees.ts`/`dashboard-data.ts` are expected at this point and are NOT this task's concern — they get fixed in Tasks 6-9).

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "Add Drizzle schema matching db/schema.sql"
```

---

## Task 4: Generate migration, patch EXCLUDE constraints, apply

**Files:**
- Create (generated): `drizzle/0000_*.sql` (exact name chosen by drizzle-kit) — then hand-edited
- Create (generated): `drizzle/meta/` (drizzle-kit bookkeeping, do not hand-edit)

**Interfaces:**
- Produces: a fully migrated Postgres database (all 9 tables, indexes, and the two `EXCLUDE USING gist` double-booking constraints) — everything from here on can run real queries against it.

- [ ] **Step 1: Generate the migration**

Run: `pnpm db:generate`
Expected: creates `drizzle/0000_<random-name>.sql` and `drizzle/meta/_journal.json` (plus a snapshot json). Read the generated `.sql` file to confirm it contains `CREATE TYPE`, all 9 `CREATE TABLE` statements, and the indexes from Task 3.

- [ ] **Step 2: Append the EXCLUDE constraints to the generated migration file**

Open the generated `drizzle/0000_*.sql` file and append this block at the end (after the last statement drizzle-kit wrote):

```sql
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "no_overlap_per_therapist"
EXCLUDE USING gist (
  therapist_id WITH =,
  tsrange(
    (reservation_date + start_time)::timestamp,
    (reservation_date + end_time)::timestamp,
    '[)'
  ) WITH &&
) WHERE (status = 'confirmed');
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "no_overlap_per_room"
EXCLUDE USING gist (
  room_id WITH =,
  tsrange(
    (reservation_date + start_time)::timestamp,
    (reservation_date + end_time)::timestamp,
    '[)'
  ) WITH &&
) WHERE (status = 'confirmed' AND room_id IS NOT NULL);
```

(The `--> statement-breakpoint` comments match drizzle-kit's own convention for splitting a migration file into separately-executed statements — copy the exact format already used between the statements drizzle-kit generated above this block.)

- [ ] **Step 3: Apply the migration**

Run: `pnpm db:migrate`
Expected: prints that it applied 1 migration, no errors.

- [ ] **Step 4: Verify the schema landed correctly**

Run: `docker exec -it $(docker compose ps -q postgres) psql -U massaman -d massaman -c '\dt'`
Expected: lists all 9 tables (`departments`, `users`, `therapist_profiles`, `therapist_shifts`, `therapist_breaks`, `rooms`, `reservations`, `reviews`, `notification_settings`).

Run: `docker exec -it $(docker compose ps -q postgres) psql -U massaman -d massaman -c '\d reservations'`
Expected: the output includes both `no_overlap_per_therapist` and `no_overlap_per_room` under "Indexes" (Postgres implements EXCLUDE constraints as indexes).

- [ ] **Step 5: Commit**

```bash
git add drizzle/
git commit -m "Generate initial Postgres migration with double-booking exclusion constraints"
```

---

## Task 5: Seed script (`src/db/seed.ts`)

**Files:**
- Create: `src/db/seed.ts`

**Interfaces:**
- Consumes: `src/db/schema.ts` (Task 3), a running migrated Postgres (Task 4).
- Produces: a populated database — 8 named test accounts + 28 synthetic employees, 2 rooms, 4 departments, ~52 weeks of shifts/reservations for 4 therapists. This is what every later task's manual verification queries against.

- [ ] **Step 1: Write the seed script**

```ts
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
  T2001: { start: 9, end: 21, baseUtil: 0.6, recentBoost: 0.32 }, // trending up
  T2002: { start: 9, end: 20, baseUtil: 0.6, recentBoost: 0.0 },
  T2003: { start: 9, end: 19, baseUtil: 0.56, recentBoost: 0.0 },
  T2004: { start: 9, end: 13, baseUtil: 0.5, recentBoost: 0.0 }, // mornings only
};

// Relative demand per hour-of-day (lunch + evening peaks).
const HOUR_WEIGHT: Record<number, number> = {
  9: 0.35, 10: 0.45, 11: 0.55, 12: 0.7, 13: 0.4, 14: 0.5,
  15: 0.35, 16: 0.3, 17: 0.55, 18: 0.8, 19: 0.92, 20: 0.6,
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
  const deptIdByName = new Map(deptRows.map((d) => [d.name, d.id]));

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

        const busyKey = `${dateStr}|${h}`;
        const busy = roomBusy.get(busyKey) ?? new Set<string>();
        roomBusy.set(busyKey, busy);
        const availableRooms = roomIds.filter((r) => !busy.has(r));
        const roomId = availableRooms.length > 0 ? rng.choice(availableRooms) : rng.choice(roomIds);
        busy.add(roomId);

        const userId = rng.choices(allUserIds, userWeights);
        const status = rng.choices(["confirmed", "completed", "cancelled"] as const, [0.15, 0.8, 0.05]);

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
```

- [ ] **Step 2: Run the seed script**

Run: `pnpm db:seed`
Expected: prints "Truncating existing tables...", "Inserting N shifts...", "Inserting N reservations...", a "Seeded: ..." summary line, then 8 `OK` lines (one per named account, `E9xxx` synthetic accounts excluded from this printout same as the original script), "8/8 件のアカウントでログイン検証が成功しました。", and "誤ったパスワードでの検証(false になるべき): false". Exits with code 0.

If it exits with a non-zero code, read the printed error:
- `password authentication failed` / `ECONNREFUSED` → Postgres isn't running or `DATABASE_URL` is wrong; re-check Task 1.
- `relation "..." does not exist` → the migration from Task 4 wasn't applied; run `pnpm db:migrate` again.

- [ ] **Step 3: Spot-check row counts directly**

Run: `docker exec -it $(docker compose ps -q postgres) psql -U massaman -d massaman -c "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM therapist_shifts) AS shifts, (SELECT COUNT(*) FROM reservations) AS reservations;"`
Expected: `users` = 36 (8 named + 28 synthetic), `shifts` and `reservations` both in the thousands (exact counts vary run-to-run since the RNG isn't byte-identical to the old Python script, but both must be > 0).

- [ ] **Step 4: Commit**

```bash
git add src/db/seed.ts
git commit -m "Add TypeScript seed script, replacing mock-db/build_mock_directory.py"
```

---

## Task 6: Rewrite `src/lib/db.ts`

**Files:**
- Modify: `src/lib/db.ts`

**Interfaces:**
- Produces: `export const db` (Drizzle instance, for `employees.ts`), `export const sql` (raw postgres.js tagged-template client, for `dashboard-data.ts`).

- [ ] **Step 1: Replace the file contents**

```ts
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

/**
 * date/time columns are pinned to plain strings (instead of postgres.js's
 * default JS Date parsing for `date`) so dashboard-data.ts's existing
 * comparison logic (lexicographic string comparisons on ISO dates,
 * `split(":")` on times) keeps working unchanged after the SQLite -> Postgres
 * migration. Cached on globalThis so Next.js dev-mode hot reloads reuse the
 * same connection instead of leaking a new one per reload.
 */
const pgClient =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL!, {
    types: {
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      time: { to: 1083, from: [1083], serialize: (x: string) => x, parse: (x: string) => x },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = pgClient;
}

/** Drizzle instance (query builder) — used by src/lib/employees.ts. */
export const db = drizzle(pgClient, { schema });

/** Raw postgres.js tagged-template client — used by src/lib/dashboard-data.ts
 * for its dynamic, hand-composed aggregation SQL (see
 * docs/superpowers/specs/2026-09-10-postgres-migration-design.md §3). */
export const sql = pgClient;
```

- [ ] **Step 2: Verify the date/time override with a throwaway query**

Create a temporary file `src/db/check-types.ts` (relative import, so no path-alias resolution concerns under plain `tsx`):

```ts
import { sql } from "../lib/db";

async function main() {
  const rows = await sql`SELECT work_date, start_time FROM therapist_shifts LIMIT 1`;
  console.log(rows[0], typeof rows[0].work_date, typeof rows[0].start_time);
  await sql.end();
}

main();
```

Run: `dotenv -e .env.local -- npx tsx src/db/check-types.ts`
Expected: prints an object like `{ work_date: '2025-09-01', start_time: '09:00:00' } string string` — both `typeof` results must say `string`, NOT `object` (which would mean the date/time override isn't working).

Delete the temporary file afterward: `rm src/db/check-types.ts` — it's not part of the app.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "Replace node:sqlite db.ts with postgres.js + Drizzle connection"
```

(`tsc --noEmit` is expected to still show errors in `employees.ts` and `dashboard-data.ts` at this point — those are fixed in Tasks 7-8.)

---

## Task 7: Rewrite `employees.ts` + update `auth.ts`

**Files:**
- Modify: `src/lib/employees.ts`
- Modify: `src/app/actions/auth.ts:24`

**Interfaces:**
- Consumes: `db` from `@/lib/db` (Task 6), `users` from `@/db/schema` (Task 3).
- Produces: `findEmployeeByCode(employeeId: string): Promise<Employee | null>` (now async — was sync before).

- [ ] **Step 1: Replace `src/lib/employees.ts`**

```ts
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import type { Role } from "@/lib/session";

export type Employee = {
  employeeId: string;
  name: string;
  role: Role;
  passwordHash: string;
};

export async function findEmployeeByCode(employeeId: string): Promise<Employee | null> {
  const rows = await db
    .select({
      employeeCode: users.employeeCode,
      name: users.name,
      role: users.role,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(and(eq(users.employeeCode, employeeId), eq(users.isActive, true)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    employeeId: row.employeeCode,
    name: row.name,
    role: row.role,
    passwordHash: row.passwordHash,
  };
}
```

- [ ] **Step 2: Update the one call site in `src/app/actions/auth.ts`**

Change line 24 from:

```ts
  const employee = findEmployeeByCode(employeeId);
```

to:

```ts
  const employee = await findEmployeeByCode(employeeId);
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors from `src/lib/employees.ts` or `src/app/actions/auth.ts` (errors from `dashboard-data.ts` and the two dashboard `page.tsx` files are still expected — fixed in Tasks 8-9).

- [ ] **Step 4: Verify login end-to-end via the running dev server**

Run: `pnpm dev` (in the background, or in a separate terminal)
Open `http://localhost:3000/login` in a browser, log in with employee ID `A3001` and password `Passw0rd!` (from `docs/database-auth-design.md` §5).
Expected: redirects to `/dashboard` (the admin home route) — this proves the full chain (Postgres → Drizzle → `employees.ts` → `auth.ts` Server Action → session cookie) works.

Also try a deliberately wrong password for the same account.
Expected: stays on `/login` with the error message "社員番号またはパスワードが正しくありません。"

- [ ] **Step 5: Commit**

```bash
git add src/lib/employees.ts "src/app/actions/auth.ts"
git commit -m "Migrate employees.ts to Drizzle query builder"
```

---

## Task 8: Rewrite `src/lib/dashboard-data.ts` (async, raw Postgres SQL)

**Files:**
- Modify: `src/lib/dashboard-data.ts` (full-file rewrite)

**Interfaces:**
- Consumes: `sql` from `@/lib/db` (Task 6).
- Produces: every exported function becomes `async` (same names, same parameter lists, same return *shapes* — just wrapped in `Promise<...>`): `getOverallStats`, `getUtilizationTrend`, `getUtilizationTrendByAttribute`, `getVacancyTrend`, `getTherapistUtilization`, `getAttributeUtilization`, `getClientAttributeShare`, `getTherapistSummary`, `listTherapists`, `listDepartments`. `overallAttributeSeries` and `attributeValueOptions` stay synchronous (pure functions, no DB access). `OVERALL_ATTRIBUTE_VALUE`, `DEFAULT_FILTER`, and every exported type are unchanged.

This task changes SQL dialect in a few places beyond a mechanical `?` → `${...}` swap — each is called out inline below:
- `is_active = 1` → `is_active = true` (real Postgres `boolean` column, not SQLite's 0/1 integer).
- `CAST(substr(r.start_time, 1, 2) AS INTEGER)` → `EXTRACT(HOUR FROM r.start_time)::int` (`start_time` is a native Postgres `time` column now, not a `TEXT` string you can substring).
- `COUNT(*)` / `COUNT(DISTINCT ...)` gets an explicit `::int` cast — Postgres `COUNT` returns `bigint`, which the `postgres` driver returns as a JS *string* to avoid silent precision loss; casting to `::int` keeps these as JS `number`, matching the existing `{ n: number }` row types.
- `age_bracket`/`gender` parameter comparisons get an explicit `::age_bracket` / `::gender` cast — bound parameters (unlike literal SQL text) don't always let Postgres infer an enum type from context.
- `listTherapists`'s `tp.id as therapistId` alias becomes `tp.id as "therapistId"` (quoted) — Postgres lowercases unquoted identifiers, so the unquoted form would come back as `.therapistid`, silently breaking the camelCase field the JSX/URL-building code reads.
- `getTherapistSummary`'s `specialties` column is now a genuine `text[]` array (was a plain string in the SQLite mock) — read back as `row.specialties?.[0] ?? null` to keep the existing `specialties: string | null` field/type/UI unchanged (each therapist has exactly one specialty string, seeded as a one-element array in Task 5).

None of this changes any of the utilization-rate/vacancy/attribute-breakdown *calculation* logic — every formula, comment, and JSDoc from the original file carries over unchanged.

- [ ] **Step 1: Replace the file contents**

```ts
import "server-only";
import { sql } from "@/lib/db";
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

async function fetchShifts(range: DateRange, therapistId?: string): Promise<ShiftRow[]> {
  const therapistClause = therapistId ? sql`AND therapist_id = ${therapistId}` : sql``;
  return sql<ShiftRow[]>`
    SELECT therapist_id, work_date, start_time, end_time
    FROM therapist_shifts
    WHERE work_date BETWEEN ${range.start} AND ${range.end}
      ${therapistClause}
  `;
}

/** WHERE-clause fragment for the age/gender/department filters, shared by
 * reservation and headcount queries so the two stay in sync (§ the "全体をその属性
 * 全体で考える" rule: narrowing the numerator must narrow the denominator to match). */
function attributeWhere(filters: AttributeFilter, extra?: { attribute: AttributeKind; value: string }) {
  const age = extra?.attribute === "age" ? extra.value : filters.ageBracket;
  const gender = extra?.attribute === "gender" ? extra.value : filters.gender;
  const department = extra?.attribute === "department" ? extra.value : filters.department;

  return sql`
    ${age !== "all" ? sql`AND u.age_bracket = ${age}::age_bracket` : sql``}
    ${gender !== "all" ? sql`AND u.gender = ${gender}::gender` : sql``}
    ${department !== "all" ? sql`AND d.name = ${department}` : sql``}
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
    SELECT r.therapist_id, r.user_id, r.reservation_date, r.start_time, r.end_time,
           u.age_bracket, u.gender, d.name as department_name
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE r.reservation_date BETWEEN ${range.start} AND ${range.end}
      AND r.status IN ('confirmed', 'completed')
      ${therapistClause}
      ${attrClause}
  `;
}

/** Total *headcount* (role='user' employees) matching the given filters — the
 * denominator for headcount-based 利用率 calculations (used only when a
 * age/gender/department filter is actually active — see isFiltered()). */
async function getHeadcount(
  filters: AttributeFilter,
  extra?: { attribute: AttributeKind; value: string }
): Promise<number> {
  const attrClause = attributeWhere(filters, extra);
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int as n FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.role = 'user' AND u.is_active = true
      ${attrClause}
  `;
  return rows[0].n;
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
export async function getOverallStats(range: DateRange, filters: AttributeFilter): Promise<OverallStats> {
  const reservations = await fetchReservations(range, filters);
  const bookedMinutes = sumReservationMinutes(reservations);

  const utilizationRate = isFiltered(filters)
    ? rate(await getDistinctUserCount(range, filters), await getHeadcount(filters))
    : rate(bookedMinutes, sumShiftMinutes(await fetchShifts(range)));

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
export async function getUtilizationTrend(
  period: PeriodType,
  currentRange: DateRange,
  previousRange: DateRange,
  filters: AttributeFilter,
  therapistId?: string
): Promise<TrendPoint[]> {
  const filtered = isFiltered(filters);
  const headcount = filtered ? await getHeadcount(filters) : 0;

  async function seriesFor(outerRange: DateRange): Promise<number[]> {
    const buckets = trendBuckets(period, outerRange);
    return Promise.all(
      buckets.map(async (b) => {
        if (filtered) {
          return rate(await countUsersInBucket(b, outerRange, filters, therapistId), headcount);
        }
        const { booked, available } = await countMinutesInBucket(b, outerRange, therapistId);
        return rate(booked, available);
      })
    );
  }

  const currentBuckets = trendBuckets(period, currentRange);
  const current = await seriesFor(currentRange);
  const previous = await seriesFor(previousRange);

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
export async function getUtilizationTrendByAttribute(
  period: PeriodType,
  range: DateRange,
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
      const points = await Promise.all(
        buckets.map(async (b, i) => ({
          label: b.label,
          rate: rate(await countBookedMinutesInBucket(b, range, filters, therapistId, extra), available[i]),
          closed: b.closed,
        }))
      );
      return { valueLabel: attributeLabel(attribute, key), points };
    })
  );
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
    SELECT r.start_time, r.end_time
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE r.status IN ('confirmed', 'completed')
      ${bucketClause}
      ${therapistClause}
      ${attrClause}
  `;
  return rows.reduce((sum, r) => sum + minutesBetween(r.start_time, r.end_time), 0);
}

async function countUsersInBucket(
  bucket: TrendBucket,
  outerRange: DateRange,
  filters: AttributeFilter,
  therapistId?: string,
  extra?: { attribute: AttributeKind; value: string }
): Promise<number> {
  const bucketClause =
    bucket.kind === "hour"
      ? sql`AND r.reservation_date BETWEEN ${outerRange.start} AND ${outerRange.end} AND EXTRACT(HOUR FROM r.start_time)::int = ${bucket.hour}`
      : sql`AND r.reservation_date BETWEEN ${bucket.start} AND ${bucket.end}`;
  const therapistClause = therapistId ? sql`AND r.therapist_id = ${therapistId}` : sql``;
  const attrClause = attributeWhere(filters, extra);

  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(DISTINCT r.user_id)::int as n
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE r.status IN ('confirmed', 'completed')
      ${bucketClause}
      ${therapistClause}
      ${attrClause}
  `;
  return rows[0].n;
}

/** Booked vs. available (shift) minutes within one trend bucket — the occupancy
 * building block shared by getUtilizationTrend and getVacancyTrend. */
async function countMinutesInBucket(
  bucket: TrendBucket,
  outerRange: DateRange,
  therapistId?: string
): Promise<{ booked: number; available: number }> {
  const shifts = await fetchShifts(outerRange, therapistId);
  const reservations = await fetchReservations(outerRange, DEFAULT_FILTER, therapistId);

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
export async function getVacancyTrend(
  period: PeriodType,
  range: DateRange,
  therapistId?: string
): Promise<VacancyPoint[]> {
  const buckets = trendBuckets(period, range);
  return Promise.all(
    buckets.map(async (b) => {
      const { booked, available } = await countMinutesInBucket(b, range, therapistId);
      return {
        label: b.label,
        vacantHours: Math.round(Math.max(0, available - booked) / 6) / 10,
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

/** 属性別 利用者数: 20代の利用率 = 20代で利用した人数 ÷ 会社の全利用者数（属性を
 * 問わない）— the denominator is always the WHOLE eligible population (narrowed
 * only by any other active top-filter, e.g. gender=男性), never re-scoped down
 * to the bucket's own subgroup size. That keeps small groups (e.g. a
 * 3-person department) from trivially reading as ~100%. */
export async function getAttributeUtilization(
  range: DateRange,
  attribute: AttributeKind,
  filters: AttributeFilter,
  therapistId?: string
): Promise<AttributeBucket[]> {
  const headcount = await getHeadcount(filters);
  return Promise.all(
    attributeOrder(attribute).map(async (key) => {
      const extra = { attribute, value: key };
      return {
        label: attributeLabel(attribute, key),
        rate: rate(await getDistinctUserCount(range, filters, therapistId, extra), headcount),
      };
    })
  );
}

/** Share (%) of a therapist's own client base per attribute bucket — sums to ~100, unlike getAttributeUtilization. */
export async function getClientAttributeShare(
  range: DateRange,
  attribute: AttributeKind,
  therapistId: string
): Promise<AttributeBucket[]> {
  const reservations = await fetchReservations(range, DEFAULT_FILTER, therapistId);
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
export async function getTherapistSummary(
  therapistId: string,
  range: DateRange,
  filters: AttributeFilter
): Promise<TherapistSummary> {
  const profiles = await sql<{ therapist_id: string; name: string; specialties: string[] | null }[]>`
    SELECT tp.id as therapist_id, u.name, tp.specialties FROM therapist_profiles tp
    JOIN users u ON u.id = tp.user_id WHERE tp.id = ${therapistId}
  `;
  const profile = profiles[0];
  if (!profile) {
    throw new Error(`Unknown therapist: ${therapistId}`);
  }

  const reservations = await fetchReservations(range, filters, therapistId);
  const bookedMinutes = sumReservationMinutes(reservations);

  const userCounts = new Map<string, number>();
  for (const r of reservations) {
    userCounts.set(r.user_id, (userCounts.get(r.user_id) ?? 0) + 1);
  }
  const repeaterCount = [...userCounts.values()].filter((c) => c >= 2).length;

  let personalRate: number;
  let overallAvgRate: number;
  if (isFiltered(filters)) {
    const headcount = await getHeadcount(filters);
    personalRate = rate(await getDistinctUserCount(range, filters, therapistId), headcount);
    overallAvgRate = rate(await getDistinctUserCount(range, filters), headcount);
  } else {
    personalRate = rate(bookedMinutes, sumShiftMinutes(await fetchShifts(range, therapistId)));
    overallAvgRate = rate(
      sumReservationMinutes(await fetchReservations(range, filters)),
      sumShiftMinutes(await fetchShifts(range))
    );
  }

  return {
    therapistId: profile.therapist_id,
    name: profile.name,
    specialties: profile.specialties?.[0] ?? null,
    personalRate,
    overallAvgRate,
    reservationCount: reservations.length,
    repeaterCount,
    avgDurationMinutes: reservations.length > 0 ? Math.round(bookedMinutes / reservations.length) : 0,
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors from `src/lib/dashboard-data.ts` itself. Errors from the two `page.tsx` files (they call these functions without `await` still) are expected — fixed in Task 9. Do NOT fix those here; that's the next task's job, so its diff stays reviewable on its own.

- [ ] **Step 3: Commit**

```bash
git add src/lib/dashboard-data.ts
git commit -m "Migrate dashboard-data.ts to async Postgres queries via postgres.js"
```

---

## Task 9: Update both dashboard `page.tsx` files

**Files:**
- Modify: `src/app/(admin)/dashboard/page.tsx`
- Modify: `src/app/(admin)/dashboard/[therapistId]/page.tsx`

**Interfaces:**
- Consumes: every now-`async` function from Task 8, plus `sql` from `@/lib/db` (replacing the direct `db.prepare(...)` roster query in the overall page).

- [ ] **Step 1: Update `src/app/(admin)/dashboard/page.tsx`**

Change the import of `db`:

```ts
import { db } from "@/lib/db";
```

to:

```ts
import { sql } from "@/lib/db";
```

Change this block (currently around line 81-98):

```ts
  const stats = getOverallStats(range, filters);
  const previousStats = compare ? getOverallStats(previousRange, filters) : null;
  const trend = lineValues.length === 0 ? getUtilizationTrend(period, range, previousRange, filters) : null;
  const attributeKeys = lineValues.filter((v) => v !== OVERALL_ATTRIBUTE_VALUE);
  const trendByAttribute =
    lineValues.length > 0
      ? [
          ...(lineValues.includes(OVERALL_ATTRIBUTE_VALUE)
            ? [overallAttributeSeries(getUtilizationTrend(period, range, previousRange, filters))]
            : []),
          ...(attributeKeys.length > 0
            ? getUtilizationTrendByAttribute(period, range, lineAttr, filters, undefined, attributeKeys)
            : []),
        ]
      : [];
  const vacancy = getVacancyTrend(period, range);
  const therapists = getTherapistUtilization(range, filters);
  const attributeBuckets = getAttributeUtilization(range, attribute, filters);

  const roster = db
    .prepare(
      `SELECT u.gender FROM therapist_profiles tp JOIN users u ON u.id = tp.user_id WHERE tp.is_active = 1`
    )
    .all() as { gender: string }[];
```

to:

```ts
  const stats = await getOverallStats(range, filters);
  const previousStats = compare ? await getOverallStats(previousRange, filters) : null;
  const trend = lineValues.length === 0 ? await getUtilizationTrend(period, range, previousRange, filters) : null;
  const attributeKeys = lineValues.filter((v) => v !== OVERALL_ATTRIBUTE_VALUE);
  const trendByAttribute =
    lineValues.length > 0
      ? [
          ...(lineValues.includes(OVERALL_ATTRIBUTE_VALUE)
            ? [overallAttributeSeries(await getUtilizationTrend(period, range, previousRange, filters))]
            : []),
          ...(attributeKeys.length > 0
            ? await getUtilizationTrendByAttribute(period, range, lineAttr, filters, undefined, attributeKeys)
            : []),
        ]
      : [];
  const vacancy = await getVacancyTrend(period, range);
  const therapists = await getTherapistUtilization(range, filters);
  const attributeBuckets = await getAttributeUtilization(range, attribute, filters);

  const roster = await sql<{ gender: string }[]>`
    SELECT u.gender FROM therapist_profiles tp JOIN users u ON u.id = tp.user_id WHERE tp.is_active = true
  `;
```

- [ ] **Step 2: Update `src/app/(admin)/dashboard/[therapistId]/page.tsx`**

Change this block (currently around line 59-89):

```ts
  const therapists = listTherapists();
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
  const summary = getTherapistSummary(therapistId, range, filters);
  const trend = lineValues.length === 0 ? getUtilizationTrend(period, range, previousRange, filters, therapistId) : null;
  const attributeKeys = lineValues.filter((v) => v !== OVERALL_ATTRIBUTE_VALUE);
  const trendByAttribute =
    lineValues.length > 0
      ? [
          ...(lineValues.includes(OVERALL_ATTRIBUTE_VALUE)
            ? [overallAttributeSeries(getUtilizationTrend(period, range, previousRange, filters, therapistId))]
            : []),
          ...(attributeKeys.length > 0
            ? getUtilizationTrendByAttribute(period, range, lineAttr, filters, therapistId, attributeKeys)
            : []),
        ]
      : [];
  const vacancy = getVacancyTrend(period, range, therapistId);
  const attributeBuckets = getClientAttributeShare(range, attribute, therapistId);
```

to:

```ts
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
            ? await getUtilizationTrendByAttribute(period, range, lineAttr, filters, therapistId, attributeKeys)
            : []),
        ]
      : [];
  const vacancy = await getVacancyTrend(period, range, therapistId);
  const attributeBuckets = await getClientAttributeShare(range, attribute, therapistId);
```

- [ ] **Step 3: Type-check, lint, build**

Run: `npx tsc --noEmit`
Expected: no errors anywhere.

Run: `pnpm lint`
Expected: no errors/warnings.

Run: `pnpm build`
Expected: builds successfully (this also exercises the Postgres connection at build-adjacent request time for these dynamic routes, so a broken query would surface here too — but the primary check is the browser pass in Step 4).

- [ ] **Step 4: Browser verification**

Run: `pnpm dev`
Log in as `A3001` / `Passw0rd!`, land on `/dashboard`.
Check:
- The 4 stat tiles show non-zero numbers.
- Switch 日/週/月/年 — the trend chart and vacancy chart both redraw without errors.
- Check the 全体/男性/女性 checkboxes under 性別 — the decomposed lines render (same behavior verified earlier this session under SQLite).
- Click "施術者個人" — switches to `/dashboard/<uuid>`, shows a real therapist's name/stats.
- Check the browser's Network tab / server terminal for any 500 errors or unhandled promise rejections.

If a query throws with something like `operator does not exist: gender = text` or `age_bracket = text`, the `::gender`/`::age_bracket` casts in `attributeWhere` (Task 8) should already prevent this — if it still happens, that's the fix.
If a query throws `function substr(time without time zone, integer, integer) does not exist`, the `EXTRACT(HOUR FROM ...)` fix should already prevent this — check the `bucketClause` in `countBookedMinutesInBucket`/`countUsersInBucket` was actually applied.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/dashboard/page.tsx" "src/app/(admin)/dashboard/[therapistId]/page.tsx"
git commit -m "Await Postgres-backed dashboard-data.ts calls in both dashboard routes"
```

---

## Task 10: Cleanup — remove SQLite, update docs

**Files:**
- Delete: `mock-db/build_mock_directory.py`, `mock-db/mock_directory.sqlite3`, `mock-db/test-credentials.md` (and the now-empty `mock-db/` directory)
- Modify: `docs/database-auth-design.md` §5
- Modify: `CLAUDE.md` ("Implementation architecture" section)
- Modify: `db/schema.sql` (header comment only)

**Interfaces:**
- None — this is a documentation/dead-code cleanup task with no code interfaces.

- [ ] **Step 1: Delete the mock-db directory**

```bash
git rm -r mock-db/
```

- [ ] **Step 2: Update `docs/database-auth-design.md` §5**

Replace this paragraph (currently right before the test-account table):

```
`mock-db/build_mock_directory.py` を実行すると、実際にこのスキーマを構築し、画面モックアップに登場する人物と対応するテストアカウントを投入できる（`mock-db/mock_directory.sqlite3`）。
```

with:

```
`pnpm db:seed` を実行すると、実際にこのスキーマ（Postgres、`src/db/schema.ts`）を構築し、画面モックアップに登場する人物と対応するテストアカウントを投入できる。
```

And replace this paragraph (currently right after the table, describing the regenerate command):

```
全アカウント共通のテスト用パスワードは **`Passw0rd!`**（bcryptでハッシュ化してDBに保存。平文はDBには入れていない）。テスト用の資格情報は別ファイル（`mock-db/test-credentials.md`）にまとめている。
```

with:

```
全アカウント共通のテスト用パスワードは **`Passw0rd!`**（bcryptjsでハッシュ化してDBに保存。平文はDBには入れていない）。
```

(This absorbs `mock-db/test-credentials.md`'s content into this doc, since that file is now deleted — the table and password above already live in this same section, so no content is actually lost.)

- [ ] **Step 3: Update `CLAUDE.md`'s "Implementation architecture" section**

Find this bullet (under `src/lib/`):

```
- `src/lib/` — `session.ts` (jose-based signed session cookie), `dal.ts` (`verifySession`/
  `requireRole`, the Data Access Layer per Next.js's own auth guidance), `db.ts` (opens
  `mock-db/mock_directory.sqlite3` via Node's built-in `node:sqlite`), `employees.ts`
  (`findEmployeeByCode`, queries that database — see below).
```

Replace it with:

```
- `src/lib/` — `session.ts` (jose-based signed session cookie), `dal.ts` (`verifySession`/
  `requireRole`, the Data Access Layer per Next.js's own auth guidance), `db.ts` (opens a
  `postgres.js` connection to the local Docker-run PostgreSQL, wrapped in Drizzle ORM —
  see `src/db/schema.ts` for the schema and `docker-compose.yml` for the local server),
  `employees.ts` (`findEmployeeByCode`, queries that database — see below).
```

Find this bullet:

```
- **Credential store**: `src/lib/employees.ts` queries `mock-db/mock_directory.sqlite3` (built by
  `mock-db/build_mock_directory.py`; see `docs/database-auth-design.md` and
  `mock-db/test-credentials.md` for the 8 test accounts / shared test password). This is a local
  SQLite stand-in for the real `db/schema.sql` PostgreSQL schema — this app is a Tech Jam
  prototype not meant for production deployment, so no real Postgres is provisioned; auth is the
  only piece currently wired to a database at all (reservations/etc. still don't exist as
  features). The `.sqlite3` file itself is gitignored — generate it with
  `pip install bcrypt && python3 mock-db/build_mock_directory.py` before running the app.
```

Replace it with:

```
- **Credential store**: `src/lib/employees.ts` queries the real PostgreSQL database (via
  Drizzle ORM, `src/db/schema.ts`) — see `docs/database-auth-design.md` and its §5 for the
  8 test accounts / shared test password. Run `docker compose up -d` to start Postgres
  locally, then `pnpm db:generate && pnpm db:migrate && pnpm db:seed` to build the schema
  and populate test data before running the app (see
  `docs/superpowers/specs/2026-09-10-postgres-migration-design.md` for the full migration
  design).
```

Find this bullet:

```
- **`node:sqlite` requires a flag**: it's still experimental in Node 22, so `package.json`'s
  `dev`/`build`/`start` scripts set `NODE_OPTIONS=--experimental-sqlite`. `@types/node` is pinned
  to `^22` (not the scaffold's original `^20`) so its `node:sqlite` type declarations are present.
```

Delete it entirely (no replacement — `node:sqlite` is gone).

- [ ] **Step 4: Update `db/schema.sql`'s header comment**

Change:

```sql
-- マッサマン (Massage Manager) — PostgreSQL schema
--
-- Implements the design decided in database-auth-design.md:
--   - employee-ID + bcrypt-hashed password auth, cookie session (app-layer, not in this schema)
--   - double-booking prevention via DB-level exclusion constraints (not app-code checks)
--   - anonymity rule: DB always holds full data; masking happens in the API response layer
--
-- Apply with: psql "$DATABASE_URL" -f db/schema.sql
```

to:

```sql
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
```

- [ ] **Step 5: Commit**

```bash
git add -A mock-db/ docs/database-auth-design.md CLAUDE.md db/schema.sql
git commit -m "Remove SQLite mock DB and update docs for the Postgres migration"
```

---

## Task 11: Final full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Clean-slate rebuild**

```bash
docker compose down -v
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Expected: every command succeeds with no errors, exactly reproducing Tasks 1-5 from a cold volume — this is the real proof that a new developer following the README/CLAUDE.md instructions from scratch would get a working environment.

- [ ] **Step 2: Static checks**

```bash
npx tsc --noEmit
pnpm lint
pnpm build
```

Expected: all three pass with zero errors/warnings.

- [ ] **Step 3: Full login sweep**

Run: `pnpm dev`
Log in with all 8 test accounts from `docs/database-auth-design.md` §5 (`E1001`/`E1002`/`E1003`/`T2001`/`T2002`/`T2003`/`T2004`/`A3001`, all password `Passw0rd!`).
Expected: each redirects to its role's home route (`/booking` for `user`, `/schedule` for `therapist`, `/dashboard` for `admin`) without error. Also try one wrong password — expect the login error message, not a crash.

- [ ] **Step 4: Full dashboard sweep (admin: `A3001`)**

On `/dashboard`:
- Cycle through 日/週/月/年, with and without "前期間と比較".
- Toggle the 年代/性別/部署 tabs and their checkboxes (including "全体").
- Confirm the 曜日別/時間帯別/週別/月別 vacancy chart renders with no `NaN`/blank bars.
- Click into "施術者個人", switch between all 4 therapists via "担当を変更".

Expected: no console errors, no blank/broken charts, numbers look plausible (not all-zero, not all-100%).

- [ ] **Step 5: Confirm nothing SQLite-related remains**

Run: `grep -ril "node:sqlite\|mock-db\|DatabaseSync" --include="*.ts" --include="*.tsx" --include="*.md" /Users/itosuyuuki1/MassaMan/src /Users/itosuyuuki1/MassaMan/*.md /Users/itosuyuuki1/MassaMan/docs 2>/dev/null`

Expected: no matches (aside from this plan and the spec doc themselves, which reference the migration by name — exclude `docs/superpowers/` from the grep if it flags those).

- [ ] **Step 6: Final commit (if anything was fixed during this pass)**

If Steps 1-5 required any fixes, commit them now with a message describing what verification caught. If everything passed clean with no further changes, there's nothing to commit — this task is done.
