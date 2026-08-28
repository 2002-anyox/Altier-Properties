/* ------------------------------------------------------------------ *
 * Reader — the inverse of the seeder.
 *
 * Reassembles the relational rows into the nested domain objects the app
 * already works with, so derive.ts and every page keep operating on plain
 * arrays. The whole portfolio is kilobytes; loading it in one pass costs
 * less than the round trips per-page queries would need.
 * ------------------------------------------------------------------ */

import { and, asc, eq, ne } from 'drizzle-orm'
import type { Db } from './client.js'
import * as t from './schema.js'
import type {
  Booking, Client, Invoice, MaintenanceRequest, Portfolio, Property,
  PropertyDocument, ReminderSettings, TeamMember,
} from '../../src/lib/types.js'

/** Postgres `time` comes back as HH:MM:SS; the domain uses HH:MM. */
const hhmm = (v: string) => v.slice(0, 5)

/** Groups child rows by their parent id in one pass. */
function groupBy<T, K extends keyof T>(rows: T[], key: K) {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const id = row[key] as unknown as string
    const list = map.get(id)
    if (list) list.push(row)
    else map.set(id, [row])
  }
  return map
}

/**
 * Everything one workspace can see, as the person asking sees it.
 *
 * The organization is named on every top-level query, and the database
 * narrows each one again through its own policies — to the workspace, and
 * within it to the properties this membership reaches. So a manager with
 * three properties assigned gets three properties and the charges against
 * them, from the same code that gives an owner the whole portfolio. The
 * filter here is not the protection; it is what makes the query say out
 * loud what it is for.
 */
export async function readPortfolio(db: Db, organizationId: string): Promise<Portfolio> {
  const [
    teamRows, propertyRows, amenityRows, noteRows, propertyDocRows, spellRows,
    clientRows, clientPropertyRows, clientDocRows, commRows,
    bookingRows, invoiceRows, requestRows, eventRows, settingsRows,
    assignmentRows,
  ] = await Promise.all([
    /* Staff only. A tenant's portal login is a membership too, and it does
       not belong on the team list. */
    db.select({
      id: t.organizationMembers.id,
      name: t.profiles.name,
      role: t.organizationMembers.role,
      title: t.organizationMembers.title,
      email: t.profiles.email,
      phone: t.profiles.phone,
      since: t.organizationMembers.since,
    })
      .from(t.organizationMembers)
      .innerJoin(t.profiles, eq(t.profiles.id, t.organizationMembers.profileId))
      .where(and(
        eq(t.organizationMembers.organizationId, organizationId),
        ne(t.organizationMembers.role, 'tenant'),
      ))
      .orderBy(asc(t.organizationMembers.id)),
    db.select().from(t.properties)
      .where(eq(t.properties.organizationId, organizationId))
      .orderBy(asc(t.properties.id)),
    db.select().from(t.propertyAmenities).orderBy(asc(t.propertyAmenities.amenity)),
    db.select().from(t.propertyNotes).orderBy(asc(t.propertyNotes.position)),
    db.select().from(t.propertyDocuments).orderBy(asc(t.propertyDocuments.id)),
    db.select().from(t.occupancySpells).orderBy(asc(t.occupancySpells.id)),
    db.select().from(t.clients)
      .where(eq(t.clients.organizationId, organizationId))
      .orderBy(asc(t.clients.id)),
    db.select().from(t.clientProperties),
    db.select().from(t.clientDocuments).orderBy(asc(t.clientDocuments.id)),
    db.select().from(t.communications).orderBy(asc(t.communications.at)),
    db.select().from(t.bookings)
      .where(eq(t.bookings.organizationId, organizationId))
      .orderBy(asc(t.bookings.id)),
    db.select().from(t.invoices).where(eq(t.invoices.organizationId, organizationId)),
    db.select().from(t.maintenanceRequests)
      .where(eq(t.maintenanceRequests.organizationId, organizationId))
      .orderBy(asc(t.maintenanceRequests.id)),
    db.select().from(t.maintenanceEvents).orderBy(asc(t.maintenanceEvents.position)),
    db.select().from(t.reminderSettings)
      .where(eq(t.reminderSettings.organizationId, organizationId)).limit(1),
    db.select().from(t.memberProperties),
  ])

  const amenities = groupBy(amenityRows, 'propertyId')
  const notes = groupBy(noteRows, 'propertyId')
  const propertyDocs = groupBy(propertyDocRows, 'propertyId')
  const spells = groupBy(spellRows, 'propertyId')
  const clientProps = groupBy(clientPropertyRows, 'clientId')
  const clientDocs = groupBy(clientDocRows, 'clientId')
  const comms = groupBy(commRows, 'clientId')
  const events = groupBy(eventRows, 'requestId')
  const assignments = groupBy(assignmentRows, 'memberId')

  const asDocument = (d: typeof propertyDocRows[number] | typeof clientDocRows[number]): PropertyDocument => ({
    id: d.id, name: d.name, category: d.category,
    sizeKb: d.sizeKb, uploadedAt: d.uploadedAt, uploadedBy: d.uploadedBy,
  })

  const properties: Property[] = propertyRows.map((p) => ({
    id: p.id, code: p.code, name: p.name, type: p.type, mode: p.mode, status: p.status,
    address: {
      line1: p.addressLine1, district: p.district, city: p.city,
      country: p.country, x: p.mapX, y: p.mapY,
    },
    bedrooms: p.bedrooms, bathrooms: p.bathrooms, sizeSqm: p.sizeSqm,
    amenities: (amenities.get(p.id) ?? []).map((a) => a.amenity),
    price: p.price, currency: 'UGX', managerId: p.managerId, rating: p.rating,
    availableFrom: p.availableFrom, acquiredOn: p.acquiredOn,
    yieldPct: p.yieldPct, notes: p.notes, photoSeed: p.photoSeed,
    documents: (propertyDocs.get(p.id) ?? []).map(asDocument),
    occupancyHistory: (spells.get(p.id) ?? []).map((h) => ({
      id: h.id, clientName: h.clientName, from: h.startsOn, to: h.endsOn,
      mode: h.mode, revenue: h.revenue,
    })),
    maintenanceNotes: (notes.get(p.id) ?? []).map((n) => n.note),
  }))

  const clients: Client[] = clientRows.map((c) => ({
    id: c.id, name: c.name, kind: c.kind, email: c.email, phone: c.phone,
    nationality: c.nationality, since: c.since, status: c.status,
    propertyIds: (clientProps.get(c.id) ?? []).map((cp) => cp.propertyId),
    idDocuments: (clientDocs.get(c.id) ?? []).map(asDocument),
    notes: c.notes, emergencyContact: c.emergencyContact,
    // Newest first, matching how the client record renders the thread.
    communications: (comms.get(c.id) ?? [])
      .map((m) => ({
        id: m.id, channel: m.channel, direction: m.direction,
        subject: m.subject, preview: m.preview, at: m.at, author: m.author,
      }))
      .sort((a, b) => (a.at < b.at ? 1 : -1)),
    lifetimeValue: c.lifetimeValue, rating: c.rating,
  }))

  const bookings: Booking[] = bookingRows.map((b) => ({
    id: b.id, reference: b.reference, propertyId: b.propertyId, clientId: b.clientId,
    mode: b.mode, status: b.status, start: b.startsOn, end: b.endsOn,
    rate: b.rate, deposit: b.deposit, advanceMonths: b.advanceMonths,
    paidThrough: b.paidThrough, noticeDays: b.noticeDays, guests: b.guests,
    source: b.source, checkIn: hhmm(b.checkIn), checkOut: hhmm(b.checkOut),
    notes: b.notes, createdAt: b.createdAt,
  }))

  const invoices: Invoice[] = invoiceRows
    .map((i) => ({
      id: i.id, number: i.number, propertyId: i.propertyId, clientId: i.clientId,
      bookingId: i.bookingId, type: i.type, issuedOn: i.issuedOn, dueOn: i.dueOn,
      amount: i.amount, earnsFrom: i.earnsFrom, earnsTo: i.earnsTo,
      paidAmount: i.paidAmount, status: i.status, method: i.method,
      paidOn: i.paidOn, memo: i.memo,
    }))
    // The ledger reads newest-due first, as the generator produced it.
    .sort((a, b) => (a.dueOn < b.dueOn ? 1 : -1))

  const maintenance: MaintenanceRequest[] = requestRows.map((m) => ({
    id: m.id, reference: m.reference, propertyId: m.propertyId, title: m.title,
    description: m.description, category: m.category, priority: m.priority,
    status: m.status, vendor: m.vendor, trade: m.trade, assigneeId: m.assigneeId,
    reportedBy: m.reportedBy, reportedOn: m.reportedOn, dueOn: m.dueOn,
    completedOn: m.completedOn, estimatedCost: m.estimatedCost, actualCost: m.actualCost,
    timeline: (events.get(m.id) ?? []).map((e) => ({ at: e.at, label: e.label, by: e.by })),
  }))

  const team: TeamMember[] = teamRows.map((m) => ({
    id: m.id, name: m.name, role: m.role, title: m.title,
    email: m.email, phone: m.phone, since: m.since,
    propertyIds: (assignments.get(m.id) ?? []).map((a) => a.propertyId),
  }))

  const s = settingsRows[0]
  if (!s) throw new Error('This workspace has no reminder settings row.')
  const reminders: ReminderSettings = {
    rentDueLeadDays: s.rentDueLeadDays,
    leaseExpiryLeadDays: s.leaseExpiryLeadDays,
    checkInLeadHours: s.checkInLeadHours,
    vacancyAlertDays: s.vacancyAlertDays,
    maintenanceLeadDays: s.maintenanceLeadDays,
    channels: s.channels,
    quietHours: { enabled: s.quietHoursEnabled, from: hhmm(s.quietHoursFrom), to: hhmm(s.quietHoursTo) },
    digest: s.digest as ReminderSettings['digest'],
  }

  return { properties, clients, bookings, invoices, maintenance, team, reminders }
}
