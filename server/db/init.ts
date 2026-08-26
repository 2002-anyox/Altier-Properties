/* ------------------------------------------------------------------ *
 * Empty portfolio
 *
 * Migrates and lays down only what the app cannot run without: the
 * reminder settings singleton and the team, because a property needs a
 * manager to belong to. Nothing else — no demo properties, clients or
 * charges — so a real deployment starts empty and is filled in through
 * the interface.
 *
 * `npm run db:init`. Use `npm run db:seed` instead to load the demo
 * portfolio, which truncates and replaces everything.
 * ------------------------------------------------------------------ */

import { sql } from 'drizzle-orm'
import { DEFAULT_REMINDERS, TEAM } from '../../src/lib/data.ts'
import type { Db } from './client.ts'
import * as t from './schema.ts'

export async function init(db: Db) {
  const existing = await db.select({ id: t.reminderSettings.id }).from(t.reminderSettings)
  if (existing.length) return { created: false }

  await db.insert(t.teamMembers).values(TEAM.map((m) => ({
    id: m.id, name: m.name, role: m.role, title: m.title,
    email: m.email, phone: m.phone, since: m.since,
  }))).onConflictDoNothing()

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
    properties: await one(t.properties),
    clients: await one(t.clients),
    bookings: await one(t.bookings),
    invoices: await one(t.invoices),
  }
}
