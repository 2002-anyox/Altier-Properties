/* ------------------------------------------------------------------ *
 * Empty portfolio
 *
 * Migrates and lays down the one row the app cannot run without: the
 * reminder settings singleton. Nothing else. No people, no properties,
 * no charges — the first person to open the app creates their own owner
 * account, and fills the portfolio in from there.
 *
 * `npm run db:init`. Use `npm run db:seed` instead to load the sample
 * portfolio for development, which truncates and replaces everything.
 * ------------------------------------------------------------------ */

import { sql } from 'drizzle-orm'
import { DEFAULT_REMINDERS } from '../../src/lib/data.js'
import type { Db } from './client.js'
import * as t from './schema.js'

export async function init(db: Db) {
  const existing = await db.select({ id: t.reminderSettings.id }).from(t.reminderSettings)
  if (existing.length) return { created: false }

  const r = DEFAULT_REMINDERS
  await db.insert(t.reminderSettings).values({
    id: 1,
    rentDueLeadDays: r.rentDueLeadDays,
    leaseExpiryLeadDays: r.leaseExpiryLeadDays,
    checkInLeadHours: r.checkInLeadHours,
    vacancyAlertDays: r.vacancyAlertDays,
    maintenanceLeadDays: r.maintenanceLeadDays,
    channels: r.channels,
    quietHoursEnabled: r.quietHours.enabled,
    quietHoursFrom: r.quietHours.from,
    quietHoursTo: r.quietHours.to,
    digest: r.digest,
  })

  return { created: true }
}

/** How many records the portfolio already holds, for the runner's report. */
export async function counts(db: Db) {
  const one = async (table: any) => {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table)
    return row?.n ?? 0
  }
  return {
    team: await one(t.teamMembers),
    properties: await one(t.properties),
    clients: await one(t.clients),
    bookings: await one(t.bookings),
    invoices: await one(t.invoices),
  }
}
