#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS script, not app code */
/**
 * Builds mock-db/mock_directory.sqlite3: a local, dependency-free stand-in for the
 * PostgreSQL schema in db/schema.sql, seeded with the test accounts from
 * database-auth-design.md so the app can be logged into locally without a real
 * Postgres server.
 *
 * This is a Node port of build_mock_directory.py (kept alongside it) for machines
 * without a real Python interpreter installed (only the Windows Store app-execution
 * alias stub, which does not run scripts) — it reuses this project's existing
 * node:sqlite and bcryptjs dependencies instead of requiring `pip install bcrypt`.
 * Keep both scripts' SCHEMA/ACCOUNTS in sync if either changes.
 *
 * Usage:
 *   node mock-db/build_mock_directory.js
 */

const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

const DB_PATH = path.join(__dirname, "mock_directory.sqlite3");
const TEST_PASSWORD = "Passw0rd!";

const SCHEMA = `
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
  specialties TEXT,
  bio         TEXT,
  photo_url   TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1
);
`;

const DEPARTMENTS = ["開発部", "営業部", "総務部", "その他"];

// [employee_code, name, role, gender, department_name]
const ACCOUNTS = [
  ["E1001", "佐々木 美咲", "user", "female", "開発部"],
  ["E1002", "山田 洋輔", "user", "male", "総務部"],
  ["E1003", "高橋 直人", "user", "male", "営業部"],
  ["T2001", "田中 仁", "therapist", "male", null],
  ["T2002", "木村 健", "therapist", "male", null],
  ["T2003", "高橋 大輔", "therapist", "male", null],
  ["T2004", "佐藤 香", "therapist", "female", null],
  ["A3001", "鈴木 一郎", "admin", "male", "総務部"],
];

function build() {
  if (fs.existsSync(DB_PATH)) {
    try {
      fs.unlinkSync(DB_PATH);
    } catch (err) {
      if (err.code !== "EBUSY") throw err;
      console.warn(
        `Warning: could not delete existing ${DB_PATH} (locked by another process, ` +
          "e.g. a running dev server). Truncating it in place instead."
      );
      fs.writeFileSync(DB_PATH, "");
    }
  }

  const conn = new DatabaseSync(DB_PATH);
  conn.exec(SCHEMA);

  const deptIds = {};
  const insertDept = conn.prepare("INSERT INTO departments (id, name) VALUES (?, ?)");
  for (const name of DEPARTMENTS) {
    const id = crypto.randomUUID();
    deptIds[name] = id;
    insertDept.run(id, name);
  }

  const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 10);

  const insertUser = conn.prepare(
    `INSERT INTO users (id, employee_code, name, department_id, role, gender, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertTherapist = conn.prepare(
    "INSERT INTO therapist_profiles (id, user_id) VALUES (?, ?)"
  );

  for (const [employeeCode, name, role, gender, deptName] of ACCOUNTS) {
    const userId = crypto.randomUUID();
    insertUser.run(
      userId,
      employeeCode,
      name,
      deptName ? deptIds[deptName] : null,
      role,
      gender,
      passwordHash
    );
    if (role === "therapist") {
      insertTherapist.run(crypto.randomUUID(), userId);
    }
  }

  conn.close();
  console.log(`Built ${DB_PATH} with ${DEPARTMENTS.length} departments and ${ACCOUNTS.length} accounts.`);
}

function verify() {
  const conn = new DatabaseSync(DB_PATH, { readOnly: true });
  const rows = conn
    .prepare("SELECT employee_code, name, role, password_hash FROM users ORDER BY employee_code")
    .all();
  conn.close();

  let allOk = true;
  for (const row of rows) {
    const ok = bcrypt.compareSync(TEST_PASSWORD, row.password_hash);
    allOk = allOk && ok;
    console.log(`${row.employee_code.padEnd(8)} ${row.name.padEnd(10)} ${row.role.padEnd(10)} ${ok ? "OK" : "FAIL"}`);
  }

  const passCount = rows.filter((r) => bcrypt.compareSync(TEST_PASSWORD, r.password_hash)).length;
  console.log(`${passCount}/${rows.length} 件のアカウントでログイン検証が成功しました。`);

  const wrongPasswordOk = bcrypt.compareSync("wrong-password", rows[0].password_hash);
  console.log(`誤ったパスワードでの検証(false になるべき): ${wrongPasswordOk}`);

  if (!allOk) throw new Error("one or more test accounts failed bcrypt verification");
  if (wrongPasswordOk) throw new Error("wrong password incorrectly verified as correct");
}

build();
verify();
