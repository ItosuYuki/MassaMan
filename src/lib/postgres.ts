import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Tagged-template query function against the real Postgres database (db/schema.sql) —
 * not yet wired to any feature; src/lib/booking still uses an in-memory mock store, and
 * src/lib/db.ts's SQLite mock-db is still what auth reads from.
 *
 * Lazily created so this module can be imported before DATABASE_URL exists — it only
 * throws once a query actually runs without it set, not at import time.
 *
 * Usage: const rows = await sql`SELECT * FROM reservations WHERE id = ${id}`;
 */
let cached: NeonQueryFunction<false, false> | null = null;

export const sql: NeonQueryFunction<false, false> = ((...args: Parameters<NeonQueryFunction<false, false>>) => {
  if (!cached) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set — see .env.example.");
    }
    cached = neon(process.env.DATABASE_URL);
  }
  return cached(...args);
}) as NeonQueryFunction<false, false>;
