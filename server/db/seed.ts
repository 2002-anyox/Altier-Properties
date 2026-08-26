/* ------------------------------------------------------------------ *
 * Seeder
 *
 * Loads the demo portfolio into the database using the very generator the
 * app runs on, so the seeded data is exactly the portfolio the UI shows —
 * anchored to today, with due dates, arrivals and arrears all live.
 *
 * Exported as a function with no side effects on import; the runner is
 * server/db/seed-cli.ts. Idempotent: it truncates first.
 * ------------------------------------------------------------------ */

import { sql } from 'drizzle-orm'
import {
  BOOKINGS, CLIENTS, DEFAULT_REMINDERS, INVOICES, MAINTENANCE, PROPERTIES, TEAM,
} from '../../src/lib/data.ts'
import { connect, type Db } from './client.ts'
import * as t from './schema.ts'

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
      ${t.propertyAmenities}, ${t.properties}, ${t.teamMembers}, ${t.reminderSettings}
    RESTART IDENTITY CASCADE
  `)

  const counts: Record<string, number> = {}

  counts.teamMembers = await insertAll(db, t.teamMembers, TEAM.map((m) => ({
    id: m.id, name: m.name, role: m.role, title: m.title,
    email: m.email, phone: m.phone, since: m.since,
  })))

  counts.properties = await insertAll(db, t.properties, PROPERTIES.map((p) => ({
    id: p.id, code: p.code, name: p.name, type: p.type, mode: p.mode, status: p.status,
    addressLine1: p.address.line1, district: p.address.district,
    city: p.address.city, country: p.address.country,
    mapX: p.address.x, mapY: p.address.y,
    bedrooms: p.bedrooms, bathrooms: p.bathrooms, sizeSqm: p.sizeSqm,
    price: p.price, managerId: p.managerId, rating: p.rating,
    availableFrom: p.availableFrom, acquiredOn: p.acquiredOn,
    yieldPct: p.yieldPct, notes: p.notes, photoSeed: p.photoSeed,
  })))

  counts.propertyAmenities = await insertAll(db, t.propertyAmenities,
    PROPERTIES.flatMap((p) => p.amenities.map((amenity) => ({ propertyId: p.id, amenity }))))

  counts.propertyNotes = await insertAll(db, t.propertyNotes,
    PROPERTIES.flatMap((p) => p.maintenanceNotes.map((note, i) => ({
      id: `${p.id}-note-${i}`, propertyId: p.id, position: i, note,
    }))))

  counts.propertyDocuments = await insertAll(db, t.propertyDocuments,
    PROPERTIES.flatMap((p) => p.documents.map((d) => ({
      id: d.id, propertyId: p.id, name: d.name, category: d.category,
      sizeKb: d.sizeKb, uploadedAt: d.uploadedAt, uploadedBy: d.uploadedBy,
    }))))

  counts.occupancySpells = await insertAll(db, t.occupancySpells,
    PROPERTIES.flatMap((p) => p.occupancyHistory.map((h) => ({
      id: h.id, propertyId: p.id, clientName: h.clientName,
      startsOn: h.from, endsOn: h.to, mode: h.mode, revenue: h.revenue,
    }))))

  counts.clients = await insertAll(db, t.clients, CLIENTS.map((c) => ({
    id: c.id, name: c.name, kind: c.kind, email: c.email, phone: c.phone,
    nationality: c.nationality, since: c.since, status: c.status,
    notes: c.notes, emergencyContact: c.emergencyContact,
    lifetimeValue: c.lifetimeValue, rating: c.rating,
  })))

  counts.clientProperties = await insertAll(db, t.clientProperties,
    CLIENTS.flatMap((c) => c.propertyIds.map((propertyId) => ({ clientId: c.id, propertyId }))))

  counts.clientDocuments = await insertAll(db, t.clientDocuments,
    CLIENTS.flatMap((c) => c.idDocuments.map((d) => ({
      id: d.id, clientId: c.id, name: d.name, category: d.category,
      sizeKb: d.sizeKb, uploadedAt: d.uploadedAt, uploadedBy: d.uploadedBy,
    }))))

  counts.communications = await insertAll(db, t.communications,
    CLIENTS.flatMap((c) => c.communications.map((m) => ({
      id: m.id, clientId: c.id, channel: m.channel, direction: m.direction,
      subject: m.subject, preview: m.preview, at: m.at, author: m.author,
    }))))

  counts.bookings = await insertAll(db, t.bookings, BOOKINGS.map((b) => ({
    id: b.id, reference: b.reference, propertyId: b.propertyId, clientId: b.clientId,
    mode: b.mode, status: b.status, startsOn: b.start, endsOn: b.end,
    rate: b.rate, deposit: b.deposit, advanceMonths: b.advanceMonths,
    paidThrough: b.paidThrough, noticeDays: b.noticeDays, guests: b.guests,
    source: b.source, checkIn: b.checkIn, checkOut: b.checkOut,
    notes: b.notes, createdAt: b.createdAt,
  })))

  counts.invoices = await insertAll(db, t.invoices, INVOICES.map((i) => ({
    id: i.id, number: i.number, propertyId: i.propertyId, clientId: i.clientId,
    bookingId: i.bookingId, type: i.type, issuedOn: i.issuedOn, dueOn: i.dueOn,
    amount: i.amount, earnsFrom: i.earnsFrom, earnsTo: i.earnsTo,
    paidAmount: i.paidAmount, status: i.status, method: i.method,
    paidOn: i.paidOn, memo: i.memo,
  })))

  counts.maintenanceRequests = await insertAll(db, t.maintenanceRequests, MAINTENANCE.map((m) => ({
    id: m.id, reference: m.reference, propertyId: m.propertyId, title: m.title,
    description: m.description, category: m.category, priority: m.priority,
    status: m.status, vendor: m.vendor, trade: m.trade, assigneeId: m.assigneeId,
    reportedBy: m.reportedBy, reportedOn: m.reportedOn, dueOn: m.dueOn,
    completedOn: m.completedOn, estimatedCost: m.estimatedCost, actualCost: m.actualCost,
  })))

  counts.maintenanceEvents = await insertAll(db, t.maintenanceEvents,
    MAINTENANCE.flatMap((m) => m.timeline.map((e, i) => ({
      id: `${m.id}-event-${i}`, requestId: m.id, position: i,
      at: e.at, label: e.label, by: e.by,
    }))))

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
  counts.reminderSettings = 1

  return counts
}
