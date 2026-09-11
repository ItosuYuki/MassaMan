import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "mock-db", "mock_directory.sqlite3");

if (!fs.existsSync(DB_PATH)) {
  throw new Error(
    `Mock database not found at ${DB_PATH}. Generate it with:\n` +
      "  pip install bcrypt\n" +
      "  python3 mock-db/build_mock_directory.py"
  );
}

/**
 * The mock-db SQLite database (see mock-db/build_mock_directory.py and
 * docs/database-auth-design.md). A local stand-in for the real PostgreSQL schema in
 * db/schema.sql — writable, since reservation cancellation and notification settings
 * (see src/lib/reservations.ts, src/lib/notifications.ts) need to persist changes here.
 */
export const db = new DatabaseSync(DB_PATH);

/**
 * Runs `fn` inside a BEGIN/COMMIT, rolling back on any thrown error.
 * `node:sqlite`'s DatabaseSync has no built-in transaction wrapper (unlike
 * better-sqlite3's `.transaction()`), so multi-statement writes need this to
 * avoid leaving a delete-then-failed-insert half-applied.
 */
export function runInTransaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
