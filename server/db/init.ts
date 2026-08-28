/* ------------------------------------------------------------------ *
 * Empty portfolio
 *
 * There is nothing left to lay down. A workspace, its subscription, its
 * first owner and its reminder settings are all created together the
 * first time somebody opens the app and sets up an account — that is the
 * only path that writes an organization, and it lives in
 * server/workspace.ts.
 *
 * So this now does what it is named for and no more: it migrates, then
 * reports what is in there. `npm run db:init`. Use `npm run db:seed`
 * instead to load the sample portfolio for development.
 * ------------------------------------------------------------------ */

import { sql } from 'drizzle-orm'
import type { Db } from './client.js'
import * as t from './schema.js'

export async function init(db: Db) {
  const existing = await db.select({ id: t.organizations.id }).from(t.organizations).limit(1)
  return { created: false, ready: existing.length > 0 }
}

/** How many records the database already holds, for the runner's report. */
export async function counts(db: Db) {
  const one = async (table: any) => {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table)
    return row?.n ?? 0
  }
  return {
    organizations: await one(t.organizations),
    team: await one(t.organizationMembers),
    properties: await one(t.properties),
    clients: await one(t.clients),
    bookings: await one(t.bookings),
    invoices: await one(t.invoices),
  }
}
