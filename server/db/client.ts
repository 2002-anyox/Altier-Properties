/* ------------------------------------------------------------------ *
 * Database connection
 *
 * Targets real Postgres via DATABASE_URL. Without one it falls back to
 * PGlite — Postgres compiled to WebAssembly — so the schema, migrations
 * and seeder can be exercised with no server running. Same SQL dialect
 * either way, so a migration proven against PGlite is a migration proven
 * for Postgres.
 * ------------------------------------------------------------------ */

import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import * as schema from './schema.js'

/* Resolved from the working directory, not import.meta.url: these entry
   points are bundled into a cache directory before running, which would
   otherwise move the path out from under them. */
const MIGRATIONS = process.env.MIGRATIONS_DIR
  ?? new URL('server/db/migrations', `file://${process.cwd()}/`).pathname

/** Where PGlite keeps its data when DATABASE_URL is not set. */
export const PGLITE_DEFAULT = '.pglite'
export const MEMORY = 'memory://'

export type Db = Awaited<ReturnType<typeof connect>>['db']

export async function connect(url = process.env.DATABASE_URL) {
  if (url) {
    const { Pool } = await import('pg')
    /* A serverless instance handles one request at a time, so one connection
       is all it can use — and a pool per instance multiplied by the number of
       instances is how a hosted Postgres runs out of connections. Point
       DATABASE_URL at the provider's pooled endpoint as well. */
    const serverless = !!process.env.VERCEL
    const pool = new Pool({
      connectionString: url,
      max: serverless ? 1 : 10,
      idleTimeoutMillis: serverless ? 10_000 : 30_000,
      /* Comfortably inside a serverless function's own limit, so a database
         that will not answer produces a diagnosis rather than the platform
         killing the invocation and answering with its own error page. */
      connectionTimeoutMillis: serverless ? 6_000 : 10_000,
    })
    const db = drizzlePg(pool, { schema })
    return {
      db,
      driver: 'postgres' as const,
      migrate: () => migratePg(db, { migrationsFolder: MIGRATIONS }),
      close: () => pool.end(),
    }
  }

  const { PGlite } = await import('@electric-sql/pglite')
  /* Persisted at .pglite by default, so `npm run db:seed` and `npm run api`
     share one database without any environment set up. PGLITE_PATH=memory://
     makes the run throwaway — what the round-trip check uses. */
  const path = process.env.PGLITE_PATH ?? PGLITE_DEFAULT
  const pglite = new PGlite(path === MEMORY ? undefined : path)
  const db = drizzlePglite(pglite, { schema })
  return {
    db,
    driver: 'pglite' as const,
    migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS }),
    close: () => pglite.close(),
  }
}
