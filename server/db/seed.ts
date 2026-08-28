/* ------------------------------------------------------------------ *
 * Seeder
 *
 * Loads the sample portfolio from scripts/fixture into a development
 * database, so the checks have something with a year of agreements,
 * charges and repairs in it to run against.
 *
 * Development only. Nothing here ships: the fixture lives outside src/
 * precisely so that no build can reach it, and a real deployment starts
 * with an empty database that its first owner fills in.
 *
 * Exported as a function with no side effects on import; the runner is
 * server/db/seed-cli.ts. Idempotent: it truncates first.
 * ------------------------------------------------------------------ */

import { sql } from 'drizzle-orm'
import {
  BOOKINGS, CLIENTS, INVOICES, MAINTENANCE, PROPERTIES, TEAM,
} from '../../scripts/fixture/portfolio.js'
import { DEFAULT_REMINDERS } from '../../src/lib/defaults.js'
import { connect, type Db } from './client.js'
import * as t from './schema.js'

/* The sample portfolio is one workspace. Fixed identifiers, so re-seeding
   replaces it rather than accumulating a new copy each time. */
export const SEED_ORG = 'org-demo-000001'
const ORG = SEED_ORG
const ORG_NAME = 'Altier Properties'

/** Postgres caps bound parameters per statement; insert in slices. */
async function insertAll<T>(db: Db, table: any, rows: T[], chunk = 400) {
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk)
    if (slice.length) await db.insert(table).values(slice as any)
  }
  return rows.length
}

export async function seed(db: Db) {
  // Children first is unnecessary with CASCADE, but naming every table keeps
  // the intent obvious and fails loudly if one is ever added and forgotten.
  await db.execute(sql`
    TRUNCATE TABLE
      ${t.maintenanceEvents}, ${t.maintenanceRequests}, ${t.invoices}, ${t.bookings},
      ${t.communications}, ${t.clientDocuments}, ${t.clientProperties}, ${t.clients},
      ${t.occupancySpells}, ${t.propertyDocuments}, ${t.propertyNotes},
      ${t.propertyAmenities}, ${t.properties}, ${t.memberProperties},
      ${t.invitationProperties}, ${t.invitations}, ${t.organizationMembers},
      ${t.profiles}, ${t.reminderSettings}, ${t.subscriptions}, ${t.organizations}
    RESTART IDENTITY CASCADE
  `)

  const counts: Record<string, number> = {}

  await db.insert(t.organizations).values({ id: ORG, name: ORG_NAME, slug: 'altier-demo' })
  counts.organizations = 1

  /* Professional, so the sample workspace has room for its seven people
     and three seats left to demonstrate the limit with. */
  await db.insert(t.subscriptions).values({
    organizationId: ORG,
    plan: 'professional',
    status: 'active',
    seatLimit: 10,
    currentPeriodStart: new Date().toISOString().slice(0, 10),
  })
  counts.subscriptions = 1

  /* One login per person, one membership per person, and the membership
     keeps the id the rest of the sample data refers to — a property's
     manager and a job's assignee both name a membership. */
  counts.profiles = await insertAll(db, t.profiles, TEAM.map((m) => ({
    id: `pr-${m.id}`, name: m.name, email: m.email, phone: m.phone,
  })))

  counts.organizationMembers = await insertAll(db, t.organizationMembers, TEAM.map((m) => ({
    id: m.id, organizationId: ORG, profileId: `pr-${m.id}`,
    role: m.role, title: m.title, status: 'active' as const, since: m.since,
  })))

  counts.properties = await insertAll(db, t.properties, PROPERTIES.map((p) => ({
    id: p.id, organizationId: ORG, code: p.code, name: p.name,
    type: p.type, mode: p.mode, status: p.status,
    addressLine1: p.address.line1, district: p.address.district,
    city: p.address.city, country: p.address.country,
    mapX: p.address.x, mapY: p.address.y,
    bedrooms: p.bedrooms, bathrooms: p.bathrooms, sizeSqm: p.sizeSqm,
    price: p.price, managerId: p.managerId, rating: p.rating,
    availableFrom: p.availableFrom, acquiredOn: p.acquiredOn,
    yieldPct: p.yieldPct, notes: p.notes, photoSeed: p.photoSeed,
  })))

  counts.memberProperties = await insertAll(db, t.memberProperties,
    TEAM.flatMap((m) => (m.propertyIds ?? []).map((propertyId) => ({
      memberId: m.id, propertyId,
    }))))

  counts.propertyAmenities = await insertAll(db, t.propertyAmenities,
    PROPERTIES.flatMap((p) => p.amenities.map((amenity) => ({
      organizationId: ORG, propertyId: p.id, amenity,
    }))))

  counts.propertyNotes = await insertAll(db, t.propertyNotes,
    PROPERTIES.flatMap((p) => p.maintenanceNotes.map((note, i) => ({
      id: `${p.id}-note-${i}`, organizationId: ORG, propertyId: p.id, position: i, note,
    }))))

  counts.propertyDocuments = await insertAll(db, t.propertyDocuments,
    PROPERTIES.flatMap((p) => p.documents.map((d) => ({
      id: d.id, organizationId: ORG, propertyId: p.id, name: d.name, category: d.category,
      sizeKb: d.sizeKb, uploadedAt: d.uploadedAt, uploadedBy: d.uploadedBy,
    }))))

  counts.occupancySpells = await insertAll(db, t.occupancySpells,
    PROPERTIES.flatMap((p) => p.occupancyHistory.map((h) => ({
      id: h.id, organizationId: ORG, propertyId: p.id, clientName: h.clientName,
      startsOn: h.from, endsOn: h.to, mode: h.mode, revenue: h.revenue,
    }))))

  counts.clients = await insertAll(db, t.clients, CLIENTS.map((c) => ({
    id: c.id, organizationId: ORG, name: c.name, kind: c.kind, email: c.email, phone: c.phone,
    nationality: c.nationality, since: c.since, status: c.status,
    notes: c.notes, emergencyContact: c.emergencyContact,
    lifetimeValue: c.lifetimeValue, rating: c.rating,
  })))

  counts.clientProperties = await insertAll(db, t.clientProperties,
    CLIENTS.flatMap((c) => c.propertyIds.map((propertyId) => ({
      organizationId: ORG, clientId: c.id, propertyId,
    }))))

  counts.clientDocuments = await insertAll(db, t.clientDocuments,
    CLIENTS.flatMap((c) => c.idDocuments.map((d) => ({
      id: d.id, organizationId: ORG, clientId: c.id, name: d.name, category: d.category,
      sizeKb: d.sizeKb, uploadedAt: d.uploadedAt, uploadedBy: d.uploadedBy,
    }))))

  counts.communications = await insertAll(db, t.communications,
    CLIENTS.flatMap((c) => c.communications.map((m) => ({
      id: m.id, organizationId: ORG, clientId: c.id, channel: m.channel, direction: m.direction,
      subject: m.subject, preview: m.preview, at: m.at, author: m.author,
    }))))

  counts.bookings = await insertAll(db, t.bookings, BOOKINGS.map((b) => ({
    id: b.id, organizationId: ORG, reference: b.reference,
    propertyId: b.propertyId, clientId: b.clientId,
    mode: b.mode, status: b.status, startsOn: b.start, endsOn: b.end,
    rate: b.rate, deposit: b.deposit, advanceMonths: b.advanceMonths,
    paidThrough: b.paidThrough, noticeDays: b.noticeDays, guests: b.guests,
    source: b.source, checkIn: b.checkIn, checkOut: b.checkOut,
    notes: b.notes, createdAt: b.createdAt,
  })))

  counts.invoices = await insertAll(db, t.invoices, INVOICES.map((i) => ({
    id: i.id, organizationId: ORG, number: i.number,
    propertyId: i.propertyId, clientId: i.clientId,
    bookingId: i.bookingId, type: i.type, issuedOn: i.issuedOn, dueOn: i.dueOn,
    amount: i.amount, earnsFrom: i.earnsFrom, earnsTo: i.earnsTo,
    paidAmount: i.paidAmount, status: i.status, method: i.method,
    paidOn: i.paidOn, memo: i.memo,
  })))

  counts.maintenanceRequests = await insertAll(db, t.maintenanceRequests, MAINTENANCE.map((m) => ({
    id: m.id, organizationId: ORG, reference: m.reference,
    propertyId: m.propertyId, title: m.title,
    description: m.description, category: m.category, priority: m.priority,
    status: m.status, vendor: m.vendor, trade: m.trade, assigneeId: m.assigneeId,
    reportedBy: m.reportedBy, reportedOn: m.reportedOn, dueOn: m.dueOn,
    completedOn: m.completedOn, estimatedCost: m.estimatedCost, actualCost: m.actualCost,
  })))

  counts.maintenanceEvents = await insertAll(db, t.maintenanceEvents,
    MAINTENANCE.flatMap((m) => m.timeline.map((e, i) => ({
      id: `${m.id}-event-${i}`, organizationId: ORG, requestId: m.id, position: i,
      at: e.at, label: e.label, by: e.by,
    }))))

  const r = DEFAULT_REMINDERS
  await db.insert(t.reminderSettings).values({
    organizationId: ORG,
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
  counts.reminderSettings = 1

  return counts
}
