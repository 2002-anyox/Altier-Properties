/* ------------------------------------------------------------------ *
 * Is this database current?
 *
 * Drizzle records every migration it applies as a hash in its own
 * bookkeeping table, and `npm run db:sql` compiles the hashes this build
 * expects into a module. Comparing the two answers the question that
 * otherwise only surfaces as a confusing query error much later: does
 * the database have the schema this code was written against?
 *
 * The migrations folder itself is deliberately not read — a serverless
 * bundle does not carry it.
 * ------------------------------------------------------------------ */

import { sql } from 'drizzle-orm'
import type { Db } from './client.ts'
import { EXPECTED_MIGRATIONS } from './expected-migrations.ts'

/** The migrations this build expects that the database has not applied. */
export async function missingMigrations(db: Db): Promise<string[]> {
  let applied: Set<string>
  try {
    const rows = await db.execute<{ hash: string }>(
      sql`select hash from "drizzle"."__drizzle_migrations"`,
    )
    /* node-postgres answers with a result object, PGlite with one too, but
       the row array is reached differently depending on the driver. */
    const list = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{ hash: string }>
    applied = new Set(list.map((r) => r.hash))
  } catch {
    /* No bookkeeping table at all. A database built by hand rather than by
       a migration is not something to second-guess: if the tables the app
       needs are there, the caller's own query will have succeeded, and
       claiming it is behind would be worse than saying nothing. */
    return []
  }
  /* Only what follows the newest recorded migration counts as missing.
     Drizzle itself decides what to apply by comparing against the newest
     row, and a database built by running an early migration through psql
     and upgrading from there has a complete schema with an incomplete
     log — reporting that as "behind" would refuse to load a database
     that is perfectly current. */
  let newest = -1
  EXPECTED_MIGRATIONS.forEach((m, i) => { if (applied.has(m.hash)) newest = i })
  return EXPECTED_MIGRATIONS.slice(newest + 1).map((m) => m.tag)
}
