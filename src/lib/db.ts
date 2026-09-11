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

/** The type of `db`, and of the transaction-scoped client Drizzle passes into
 * `db.transaction(async (tx) => ...)` — shift/break writes that must commit
 * or roll back together take this instead of the module-level `db` directly. */
export type DbClient = typeof db;
