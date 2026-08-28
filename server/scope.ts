/* ------------------------------------------------------------------ *
 * Request scope
 *
 * Everything a signed-in person's request touches runs through here, and
 * what it does is small: open a transaction, drop from the owning role to
 * `altier_app`, and say who is asking and which workspace they claim.
 *
 * That last part is what makes the policies in 0004_isolation.sql mean
 * something. The owning role bypasses row-level security — it has to, or
 * signing in could not read the passwords table before anybody is signed
 * in. `altier_app` does not bypass anything, so from the moment the role
 * changes the database is deciding what this request may see, one row at
 * a time, and it keeps deciding after the query leaves this file.
 *
 * The two settings are a claim, not a grant. `altier_org()` looks the
 * pairing up in organization_members and returns nothing unless a row
 * says the membership is real and active — so the worst a mistake up here
 * can do is name a workspace this person is not in, and see an empty
 * portfolio.
 * ------------------------------------------------------------------ */

import { sql } from 'drizzle-orm'
import type { Db } from './db/client.js'

/** The unprivileged role the policies are written for. */
export const APP_ROLE = 'altier_app'

export interface Scope {
  profileId: string
  organizationId: string | null
}

/**
 * Runs `fn` against a handle the database's policies apply to.
 *
 * `SET LOCAL` is scoped to the transaction, so nothing leaks onto the
 * next request that borrows the same pooled connection — which, on a
 * serverless instance holding exactly one, is every request after this
 * one. The role name is interpolated because Postgres will not take it as
 * a parameter; it is this file's own constant, never anything a caller
 * supplies. The two values that do come from outside are bound.
 */
export function scoped<T>(db: Db, scope: Scope, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${APP_ROLE}`))
    await tx.execute(sql`select set_config('altier.profile_id', ${scope.profileId}, true)`)
    await tx.execute(sql`select set_config('altier.organization_id', ${scope.organizationId ?? ''}, true)`)
    /* A transaction handle carries the same query API as the connection
       it came from; the two driver-specific types just do not name a
       common ancestor, so this says what is already true. */
    return fn(tx as unknown as Db)
  })
}
