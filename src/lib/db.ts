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
 * docs/database-auth-design.md). Read-only: this is a local stand-in for the real
 * PostgreSQL schema in db/schema.sql, used here only for auth (see src/lib/employees.ts).
 */
export const db = new DatabaseSync(DB_PATH, { readOnly: true });
