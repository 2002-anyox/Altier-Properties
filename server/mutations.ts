/* ------------------------------------------------------------------ *
 * Mutations
 *
 * These mirror the reducer in src/lib/store.tsx exactly. The client still
 * applies each change optimistically so the interface stays instant; the
 * server is the authority, and every handler returns the refreshed
 * portfolio so the two can never drift.
 * ------------------------------------------------------------------ */

import { and, eq, sql } from 'drizzle-orm'
import type { Db } from './db/client.ts'
import * as t from './db/schema.ts'
import type {
  Booking, Client, Invoice, MaintenancePriority, MaintenanceStatus, Property,
  PropertyStatus, ReminderSettings, TeamMember,
} from '../src/lib/types.ts'

const today = () => new Date().toISOString().slice(0, 10)

export class NotFound extends Error {}

async function requireOne<T>(rows: T[], what: string): Promise<T> {
  const row = rows[0]
  if (!row) throw new NotFound(`${what} not found`)
  return row
}

/** Settle an invoice in full. */
export async function recordPayment(db: Db, invoiceId: string) {
  const invoice = await requireOne(
    await db.select().from(t.invoices).where(eq(t.invoices.id, invoiceId)),
    `invoice ${invoiceId}`,
  )
  await db.update(t.invoices).set({
    status: 'paid',
    paidAmount: invoice.amount,
    paidOn: today(),
    method: invoice.method ?? 'bank_transfer',
  }).where(eq(t.invoices.id, invoiceId))
}

/** Chase an unpaid invoice, logged against the client's thread. */
export async function sendReminder(db: Db, invoiceId: string) {
  const invoice = await requireOne(
    await db.select().from(t.invoices).where(eq(t.invoices.id, invoiceId)),
    `invoice ${invoiceId}`,
  )
  await db.insert(t.communications).values({
    id: `${invoice.clientId}-cm-${Date.now()}`,
    clientId: invoice.clientId,
    channel: 'email',
    direction: 'outbound',
    subject: `Payment reminder — ${invoice.number}`,
    preview: `A polite reminder that ${invoice.memo} is due on ${invoice.dueOn}.`,
    at: today(),
    author: 'Altier Properties',
  })
}

export async function setPropertyStatus(db: Db, id: string, status: PropertyStatus) {
  const property = await requireOne(
    await db.select().from(t.properties).where(eq(t.properties.id, id)),
    `property ${id}`,
  )
  await db.update(t.properties).set({
    status,
    // Going vacant starts the clock the vacancy alerts read from.
    availableFrom: status === 'available' ? today() : property.availableFrom,
  }).where(eq(t.properties.id, id))
}

export async function setMaintenanceStatus(db: Db, id: string, status: MaintenanceStatus) {
  const request = await requireOne(
    await db.select().from(t.maintenanceRequests).where(eq(t.maintenanceRequests.id, id)),
    `maintenance request ${id}`,
  )
  const completing = status === 'completed'
  await db.update(t.maintenanceRequests).set({
    status,
    completedOn: completing ? today() : null,
    actualCost: completing ? (request.actualCost ?? request.estimatedCost) : request.actualCost,
  }).where(eq(t.maintenanceRequests.id, id))

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${t.maintenanceEvents.position}), -1) + 1` })
    .from(t.maintenanceEvents)
    .where(eq(t.maintenanceEvents.requestId, id))

  await db.insert(t.maintenanceEvents).values({
    id: `${id}-event-${next}`,
    requestId: id,
    position: Number(next),
    at: today(),
    label: `Status changed to ${status.replace(/_/g, ' ')}`,
    by: 'You',
  })
}

export interface NewMaintenance {
  propertyId: string
  title: string
  description?: string
  priority: MaintenancePriority
  vendor: string
  dueOn: string
}

export async function addMaintenance(db: Db, input: NewMaintenance) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.maintenanceRequests)
  const id = `m-new-${Date.now()}`
  const reference = `MNT-${3400 + Number(n)}`

  await db.insert(t.maintenanceRequests).values({
    id,
    reference,
    propertyId: input.propertyId,
    title: input.title,
    description: input.description?.trim() || 'Logged from the maintenance board.',
    category: 'structural',
    priority: input.priority,
    status: 'reported',
    vendor: input.vendor,
    trade: 'Building',
    assigneeId: 'tm-06',
    reportedBy: 'You',
    reportedOn: today(),
    dueOn: input.dueOn,
    completedOn: null,
    estimatedCost: 0,
    actualCost: null,
  })
  await db.insert(t.maintenanceEvents).values({
    id: `${id}-event-0`, requestId: id, position: 0,
    at: today(), label: 'Request logged', by: 'You',
  })
  return id
}

export async function addNote(db: Db, clientId: string, text: string) {
  await requireOne(
    await db.select().from(t.clients).where(eq(t.clients.id, clientId)),
    `client ${clientId}`,
  )
  await db.insert(t.communications).values({
    id: `${clientId}-cm-${Date.now()}`,
    clientId,
    channel: 'note',
    direction: 'outbound',
    subject: 'Internal note',
    preview: text,
    at: today(),
    author: 'You',
  })
}

export async function updateReminders(db: Db, patch: Partial<ReminderSettings>) {
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.rentDueLeadDays !== undefined) set.rentDueLeadDays = patch.rentDueLeadDays
  if (patch.leaseExpiryLeadDays !== undefined) set.leaseExpiryLeadDays = patch.leaseExpiryLeadDays
  if (patch.checkInLeadHours !== undefined) set.checkInLeadHours = patch.checkInLeadHours
  if (patch.vacancyAlertDays !== undefined) set.vacancyAlertDays = patch.vacancyAlertDays
  if (patch.maintenanceLeadDays !== undefined) set.maintenanceLeadDays = patch.maintenanceLeadDays
  if (patch.channels !== undefined) set.channels = patch.channels
  if (patch.digest !== undefined) set.digest = patch.digest
  if (patch.quietHours !== undefined) {
    set.quietHoursEnabled = patch.quietHours.enabled
    set.quietHoursFrom = patch.quietHours.from
    set.quietHoursTo = patch.quietHours.to
  }
  await db.update(t.reminderSettings).set(set).where(eq(t.reminderSettings.id, 1))
}

/* ------------------------- creating records ------------------------ *
 * The client builds each record with the factories in src/lib/create.ts
 * and sends it whole, identifier included, so the row stored here is the
 * row the screen already drew. These writers are the seeder's insert
 * logic for a single record — the same column mapping, so a record made
 * at runtime is indistinguishable from a seeded one.
 * ------------------------------------------------------------------- */

const propertyColumns = (p: Property) => ({
  id: p.id, code: p.code, name: p.name, type: p.type, mode: p.mode, status: p.status,
  addressLine1: p.address.line1, district: p.address.district,
  city: p.address.city, country: p.address.country,
  mapX: p.address.x, mapY: p.address.y,
  bedrooms: p.bedrooms, bathrooms: p.bathrooms, sizeSqm: p.sizeSqm,
  price: p.price, managerId: p.managerId, rating: p.rating,
  availableFrom: p.availableFrom, acquiredOn: p.acquiredOn,
  yieldPct: p.yieldPct, notes: p.notes, photoSeed: p.photoSeed,
})

/** Replaces a property's amenity set; they are rows, not an array column. */
async function writeAmenities(db: Db, propertyId: string, amenities: string[]) {
  await db.delete(t.propertyAmenities).where(eq(t.propertyAmenities.propertyId, propertyId))
  const rows = [...new Set(amenities)].map((amenity) => ({ propertyId, amenity }))
  if (rows.length) await db.insert(t.propertyAmenities).values(rows)
}

export async function addProperty(db: Db, property: Property) {
  await db.insert(t.properties).values(propertyColumns(property))
  await writeAmenities(db, property.id, property.amenities)
  if (property.maintenanceNotes.length) {
    await db.insert(t.propertyNotes).values(property.maintenanceNotes.map((note, i) => ({
      id: `${property.id}-note-${i}`, propertyId: property.id, position: i, note,
    })))
  }
}

export async function updateProperty(db: Db, id: string, property: Property) {
  await requireOne(
    await db.select({ id: t.properties.id }).from(t.properties).where(eq(t.properties.id, id)),
    `property ${id}`,
  )
  // The identifier and code are the record's identity, not editable fields.
  const { id: _ignored, code: _code, ...columns } = propertyColumns(property)
  await db.update(t.properties).set(columns).where(eq(t.properties.id, id))
  await writeAmenities(db, id, property.amenities)
}

export async function addClient(db: Db, client: Client) {
  await db.insert(t.clients).values({
    id: client.id, name: client.name, kind: client.kind, email: client.email,
    phone: client.phone, nationality: client.nationality, since: client.since,
    status: client.status, notes: client.notes,
    emergencyContact: client.emergencyContact,
    lifetimeValue: client.lifetimeValue, rating: client.rating,
  })
  if (client.propertyIds.length) {
    await db.insert(t.clientProperties).values(
      [...new Set(client.propertyIds)].map((propertyId) => ({ clientId: client.id, propertyId })),
    )
  }
  if (client.communications.length) {
    await db.insert(t.communications).values(client.communications.map((c) => ({
      id: c.id, clientId: client.id, channel: c.channel, direction: c.direction,
      subject: c.subject, preview: c.preview, at: c.at, author: c.author,
    })))
  }
}

/**
 * An agreement commits the unit, opens the client's charges and links the
 * two. Every write happens in one transaction so a rejected charge cannot
 * leave a property marked occupied against a tenancy that does not exist.
 */
export async function addBooking(db: Db, booking: Booking, invoices: Invoice[]) {
  await requireOne(
    await db.select({ id: t.properties.id }).from(t.properties).where(eq(t.properties.id, booking.propertyId)),
    `property ${booking.propertyId}`,
  )
  await requireOne(
    await db.select({ id: t.clients.id }).from(t.clients).where(eq(t.clients.id, booking.clientId)),
    `client ${booking.clientId}`,
  )

  await db.transaction(async (tx) => {
    await tx.insert(t.bookings).values({
      id: booking.id, reference: booking.reference, propertyId: booking.propertyId,
      clientId: booking.clientId, mode: booking.mode, status: booking.status,
      startsOn: booking.start, endsOn: booking.end, rate: booking.rate,
      deposit: booking.deposit, advanceMonths: booking.advanceMonths,
      paidThrough: booking.paidThrough, noticeDays: booking.noticeDays,
      guests: booking.guests, source: booking.source,
      checkIn: booking.checkIn, checkOut: booking.checkOut,
      notes: booking.notes, createdAt: booking.createdAt,
    })

    if (invoices.length) {
      await tx.insert(t.invoices).values(invoices.map((i) => ({
        id: i.id, number: i.number, propertyId: i.propertyId, clientId: i.clientId,
        bookingId: i.bookingId, type: i.type, issuedOn: i.issuedOn, dueOn: i.dueOn,
        amount: i.amount, earnsFrom: i.earnsFrom, earnsTo: i.earnsTo,
        paidAmount: i.paidAmount, status: i.status, method: i.method,
        paidOn: i.paidOn, memo: i.memo,
      })))
    }

    await tx.update(t.properties)
      .set({ status: booking.status === 'upcoming' ? 'reserved' : 'occupied', availableFrom: null })
      .where(eq(t.properties.id, booking.propertyId))

    await tx.update(t.clients).set({ status: 'active' }).where(eq(t.clients.id, booking.clientId))

    // The link may already exist from an earlier tenancy in the same unit.
    await tx.insert(t.clientProperties)
      .values({ clientId: booking.clientId, propertyId: booking.propertyId })
      .onConflictDoNothing()
  })
}

/* ------------------------ editing and removal ---------------------- *
 * Removal is where the schema's relationships stop being theoretical.
 * A client with a tenancy behind them cannot simply vanish — their
 * charges reference them — so the refusal happens here, with a reason
 * worth reading, rather than as a foreign-key error from the driver.
 * ------------------------------------------------------------------- */

/** A refusal the caller can act on, as opposed to a fault. */
export class Conflict extends Error {}

export async function updateClient(db: Db, id: string, client: Client) {
  await requireOne(
    await db.select({ id: t.clients.id }).from(t.clients).where(eq(t.clients.id, id)),
    `client ${id}`,
  )
  await db.update(t.clients).set({
    name: client.name, kind: client.kind, email: client.email, phone: client.phone,
    nationality: client.nationality, status: client.status, notes: client.notes,
    emergencyContact: client.emergencyContact,
  }).where(eq(t.clients.id, id))

  await db.delete(t.clientProperties).where(eq(t.clientProperties.clientId, id))
  const links = [...new Set(client.propertyIds)].map((propertyId) => ({ clientId: id, propertyId }))
  if (links.length) await db.insert(t.clientProperties).values(links)
}

export async function updateBooking(db: Db, id: string, booking: Booking) {
  const existing = await requireOne(
    await db.select().from(t.bookings).where(eq(t.bookings.id, id)),
    `agreement ${id}`,
  )
  /* Which unit and which client an agreement is for decides what was
     already charged against it, so an edit may not move either. */
  if (booking.propertyId !== existing.propertyId || booking.clientId !== existing.clientId) {
    throw new Conflict('An agreement cannot be moved to another property or client. End it and open a new one.')
  }
  if (booking.end && booking.end <= booking.start) {
    throw new Conflict('An agreement cannot end on or before the day it starts. Cancel it instead.')
  }
  await db.update(t.bookings).set({
    status: booking.status, startsOn: booking.start, endsOn: booking.end,
    rate: booking.rate, deposit: booking.deposit, advanceMonths: booking.advanceMonths,
    paidThrough: booking.paidThrough, noticeDays: booking.noticeDays,
    guests: booking.guests, source: booking.source, notes: booking.notes,
  }).where(eq(t.bookings.id, id))

  // A closed agreement frees its unit; an open one holds it.
  const closed = booking.status === 'completed' || booking.status === 'cancelled'
  await db.update(t.properties)
    .set(closed
      ? { status: 'available', availableFrom: booking.end }
      : { status: booking.status === 'upcoming' ? 'reserved' : 'occupied', availableFrom: null })
    .where(eq(t.properties.id, booking.propertyId))
}

/** Removing a property takes its agreements, charges and jobs with it. */
export async function deleteProperty(db: Db, id: string) {
  await requireOne(
    await db.select({ id: t.properties.id }).from(t.properties).where(eq(t.properties.id, id)),
    `property ${id}`,
  )
  // invoices reference clients with ON DELETE RESTRICT, so clear them first.
  await db.delete(t.invoices).where(eq(t.invoices.propertyId, id))
  await db.delete(t.bookings).where(eq(t.bookings.propertyId, id))
  await db.delete(t.properties).where(eq(t.properties.id, id))
}

export async function deleteClient(db: Db, id: string) {
  await requireOne(
    await db.select({ id: t.clients.id }).from(t.clients).where(eq(t.clients.id, id)),
    `client ${id}`,
  )
  const [{ n: agreements }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(t.bookings).where(eq(t.bookings.clientId, id))
  const [{ n: charges }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(t.invoices).where(eq(t.invoices.clientId, id))

  /* Their charges are the record of what was owed and paid. Deleting the
     client would either destroy that or orphan it, so refuse and point
     at the honest alternative. */
  if (agreements > 0 || charges > 0) {
    throw new Conflict(
      `${describe(agreements, 'agreement')} and ${describe(charges, 'charge')} reference this client, `
      + 'so removing them would destroy that history. Mark them as past instead.',
    )
  }
  await db.delete(t.clients).where(eq(t.clients.id, id))
}

export async function deleteBooking(db: Db, id: string) {
  const booking = await requireOne(
    await db.select().from(t.bookings).where(eq(t.bookings.id, id)),
    `agreement ${id}`,
  )
  /* A charge that was actually paid is a record of money that moved, so it
     survives the agreement, unlinked. One that was never paid was only ever
     an expectation this agreement created, and goes with it — otherwise a
     mistaken agreement leaves arrears behind that nobody owes. */
  await db.delete(t.invoices)
    .where(and(eq(t.invoices.bookingId, id), eq(t.invoices.paidAmount, 0)))
  await db.update(t.invoices).set({ bookingId: null }).where(eq(t.invoices.bookingId, id))
  await db.delete(t.bookings).where(eq(t.bookings.id, id))
  await db.update(t.properties)
    .set({ status: 'available', availableFrom: null })
    .where(eq(t.properties.id, booking.propertyId))
}

/* -------------------------------- team ----------------------------- */

/**
 * Creates the member and, optionally, their credentials in one statement.
 * Setting the password afterwards would race the creation — the client
 * cannot know the row exists yet — and leave an account nobody can use.
 */
export async function addMember(db: Db, member: TeamMember, passwordHash?: string) {
  await db.insert(t.teamMembers).values({
    id: member.id, name: member.name, role: member.role, title: member.title,
    email: member.email, phone: member.phone, since: member.since,
    passwordHash: passwordHash ?? null,
    passwordSetAt: passwordHash ? new Date() : null,
  })
}

export async function updateMember(db: Db, id: string, member: TeamMember) {
  await requireOne(
    await db.select({ id: t.teamMembers.id }).from(t.teamMembers).where(eq(t.teamMembers.id, id)),
    `team member ${id}`,
  )
  await db.update(t.teamMembers).set({
    name: member.name, role: member.role, title: member.title,
    email: member.email, phone: member.phone,
  }).where(eq(t.teamMembers.id, id))
}

export async function deleteMember(db: Db, id: string) {
  await requireOne(
    await db.select({ id: t.teamMembers.id }).from(t.teamMembers).where(eq(t.teamMembers.id, id)),
    `team member ${id}`,
  )
  const [{ n: managed }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(t.properties).where(eq(t.properties.managerId, id))
  if (managed > 0) {
    throw new Conflict(
      `They manage ${describe(managed, 'property', 'properties')}. `
      + 'Reassign those to someone else before removing them.',
    )
  }
  const [{ n: jobs }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(t.maintenanceRequests).where(eq(t.maintenanceRequests.assigneeId, id))
  if (jobs > 0) {
    throw new Conflict(
      `They are assigned ${describe(jobs, 'maintenance job')}. Reassign those first.`,
    )
  }
  const [{ n: remaining }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.teamMembers)
  if (remaining <= 1) throw new Conflict('The last person on the team cannot be removed.')

  await db.delete(t.teamMembers).where(eq(t.teamMembers.id, id))
}

const describe = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`
