/* ------------------------------------------------------------------ *
 * Mutations
 *
 * These mirror the reducer in src/lib/store.tsx exactly. The client still
 * applies each change optimistically so the interface stays instant; the
 * server is the authority, and every handler returns the refreshed
 * portfolio so the two can never drift.
 * ------------------------------------------------------------------ */

import { randomUUID } from 'node:crypto'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { Db } from './db/client.js'
import * as t from './db/schema.js'
import { openingCharges } from '../src/lib/create.js'
import { assertSeatAvailable } from './workspace.js'
import type {
  Booking, Client, Invoice, MaintenancePriority, MaintenanceStatus, Property,
  PropertyStatus, ReminderSettings, Role, TeamMember,
} from '../src/lib/types.js'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Which workspace a mutation is writing into, and on whose behalf.
 *
 * Every one of these functions takes it, and every row they create
 * carries the organization. That is belt to the database's braces: the
 * policies would refuse a row belonging elsewhere anyway, but a writer
 * that has to be told where it is writing cannot quietly write nowhere.
 *
 * The name is here because notes and timeline entries used to be signed
 * "You", which reads oddly to the colleague who finds them a week later.
 */
export interface Workspace {
  organizationId: string
  memberId: string
  name: string
}

export class NotFound extends Error {}

async function requireOne<T>(rows: T[], what: string): Promise<T> {
  const row = rows[0]
  if (!row) throw new NotFound(`${what} not found`)
  return row
}

/** Settle an invoice in full. */
export async function recordPayment(db: Db, w: Workspace, invoiceId: string) {
  const invoice = await requireOne(
    await db.select().from(t.invoices)
      .where(and(eq(t.invoices.id, invoiceId), eq(t.invoices.organizationId, w.organizationId))),
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
export async function sendReminder(db: Db, w: Workspace, invoiceId: string) {
  const invoice = await requireOne(
    await db.select().from(t.invoices)
      .where(and(eq(t.invoices.id, invoiceId), eq(t.invoices.organizationId, w.organizationId))),
    `invoice ${invoiceId}`,
  )
  /* A note, not an email. Altier has no mail server, and recording this
     as sent correspondence would leave somebody believing a message went
     out that never did. */
  await db.insert(t.communications).values({
    id: `${invoice.clientId}-cm-${Date.now()}`,
    organizationId: w.organizationId,
    clientId: invoice.clientId,
    channel: 'note',
    direction: 'outbound',
    subject: `Payment reminder due · ${invoice.number}`,
    preview: `Flagged for follow-up: ${invoice.memo} is due on ${invoice.dueOn}.`,
    at: today(),
    author: w.name,
  })
}

export async function setPropertyStatus(db: Db, w: Workspace, id: string, status: PropertyStatus) {
  const property = await requireOne(
    await db.select().from(t.properties)
      .where(and(eq(t.properties.id, id), eq(t.properties.organizationId, w.organizationId))),
    `property ${id}`,
  )
  await db.update(t.properties).set({
    status,
    // Going vacant starts the clock the vacancy alerts read from.
    availableFrom: status === 'available' ? today() : property.availableFrom,
  }).where(eq(t.properties.id, id))
}

export async function setMaintenanceStatus(db: Db, w: Workspace, id: string, status: MaintenanceStatus) {
  const request = await requireOne(
    await db.select().from(t.maintenanceRequests).where(and(
      eq(t.maintenanceRequests.id, id),
      eq(t.maintenanceRequests.organizationId, w.organizationId),
    )),
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
    organizationId: w.organizationId,
    requestId: id,
    position: Number(next),
    at: today(),
    label: `Status changed to ${status.replace(/_/g, ' ')}`,
    by: w.name,
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

export async function addMaintenance(db: Db, w: Workspace, input: NewMaintenance) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.maintenanceRequests)
  const id = `m-new-${Date.now()}`
  const reference = `MNT-${3400 + Number(n)}`

  await db.insert(t.maintenanceRequests).values({
    id,
    organizationId: w.organizationId,
    reference,
    propertyId: input.propertyId,
    title: input.title,
    description: input.description?.trim() || 'Logged from the maintenance board.',
    category: 'structural',
    priority: input.priority,
    status: 'reported',
    vendor: input.vendor,
    trade: 'Building',
    /* It sits with whoever logged it until they hand it on. The old code
       named a seeded member here, which in a real workspace is somebody
       who does not exist. */
    assigneeId: w.memberId,
    reportedBy: w.name,
    reportedOn: today(),
    dueOn: input.dueOn,
    completedOn: null,
    estimatedCost: 0,
    actualCost: null,
  })
  await db.insert(t.maintenanceEvents).values({
    id: `${id}-event-0`, organizationId: w.organizationId, requestId: id, position: 0,
    at: today(), label: 'Request logged', by: w.name,
  })
  return id
}

export async function addNote(db: Db, w: Workspace, clientId: string, text: string) {
  await requireOne(
    await db.select().from(t.clients)
      .where(and(eq(t.clients.id, clientId), eq(t.clients.organizationId, w.organizationId))),
    `client ${clientId}`,
  )
  await db.insert(t.communications).values({
    id: `${clientId}-cm-${Date.now()}`,
    organizationId: w.organizationId,
    clientId,
    channel: 'note',
    direction: 'outbound',
    subject: 'Internal note',
    preview: text,
    at: today(),
    author: w.name,
  })
}

export async function updateReminders(db: Db, w: Workspace, patch: Partial<ReminderSettings>) {
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
  await db.update(t.reminderSettings).set(set)
    .where(eq(t.reminderSettings.organizationId, w.organizationId))
}

/* ------------------------- creating records ------------------------ *
 * The client builds each record with the factories in src/lib/create.ts
 * and sends it whole, identifier included, so the row stored here is the
 * row the screen already drew. These writers are the seeder's insert
 * logic for a single record — the same column mapping, so a record made
 * at runtime is indistinguishable from a seeded one.
 * ------------------------------------------------------------------- */

const propertyColumns = (p: Property, organizationId: string) => ({
  id: p.id, organizationId, code: p.code, name: p.name,
  type: p.type, mode: p.mode, status: p.status,
  addressLine1: p.address.line1, district: p.address.district,
  city: p.address.city, country: p.address.country,
  mapX: p.address.x, mapY: p.address.y,
  bedrooms: p.bedrooms, bathrooms: p.bathrooms, sizeSqm: p.sizeSqm,
  price: p.price, managerId: p.managerId, rating: p.rating,
  availableFrom: p.availableFrom, acquiredOn: p.acquiredOn,
  yieldPct: p.yieldPct, notes: p.notes, photoSeed: p.photoSeed,
})

/** Replaces a property's amenity set; they are rows, not an array column. */
async function writeAmenities(db: Db, w: Workspace, propertyId: string, amenities: string[]) {
  await db.delete(t.propertyAmenities).where(eq(t.propertyAmenities.propertyId, propertyId))
  const rows = [...new Set(amenities)]
    .map((amenity) => ({ organizationId: w.organizationId, propertyId, amenity }))
  if (rows.length) await db.insert(t.propertyAmenities).values(rows)
}

export async function addProperty(db: Db, w: Workspace, property: Property) {
  await db.insert(t.properties).values(propertyColumns(property, w.organizationId))
  await writeAmenities(db, w, property.id, property.amenities)
  if (property.maintenanceNotes.length) {
    await db.insert(t.propertyNotes).values(property.maintenanceNotes.map((note, i) => ({
      id: `${property.id}-note-${i}`, organizationId: w.organizationId,
      propertyId: property.id, position: i, note,
    })))
  }
}

export async function updateProperty(db: Db, w: Workspace, id: string, property: Property) {
  await requireOne(
    await db.select({ id: t.properties.id }).from(t.properties)
      .where(and(eq(t.properties.id, id), eq(t.properties.organizationId, w.organizationId))),
    `property ${id}`,
  )
  /* The identifier, the code and the workspace are the record's identity,
     not editable fields. */
  const { id: _ignored, code: _code, organizationId: _org, ...columns } =
    propertyColumns(property, w.organizationId)
  await db.update(t.properties).set(columns).where(eq(t.properties.id, id))
  await writeAmenities(db, w, id, property.amenities)
}

export async function addClient(db: Db, w: Workspace, client: Client) {
  await db.insert(t.clients).values({
    id: client.id, organizationId: w.organizationId,
    name: client.name, kind: client.kind, email: client.email,
    phone: client.phone, nationality: client.nationality, since: client.since,
    status: client.status, notes: client.notes,
    emergencyContact: client.emergencyContact,
    lifetimeValue: client.lifetimeValue, rating: client.rating,
  })
  if (client.propertyIds.length) {
    await db.insert(t.clientProperties).values(
      [...new Set(client.propertyIds)].map((propertyId) => ({
        organizationId: w.organizationId, clientId: client.id, propertyId,
      })),
    )
  }
  if (client.communications.length) {
    await db.insert(t.communications).values(client.communications.map((c) => ({
      id: c.id, organizationId: w.organizationId,
      clientId: client.id, channel: c.channel, direction: c.direction,
      subject: c.subject, preview: c.preview, at: c.at, author: c.author,
    })))
  }
}

/**
 * An agreement commits the unit, opens the client's charges and links the
 * two. Every write happens in one transaction so a rejected charge cannot
 * leave a property marked occupied against a tenancy that does not exist.
 */
export async function addBooking(db: Db, w: Workspace, booking: Booking, invoices: Invoice[]) {
  const property = await requireOne(
    await db.select().from(t.properties).where(and(
      eq(t.properties.id, booking.propertyId),
      eq(t.properties.organizationId, w.organizationId),
    )),
    `property ${booking.propertyId}`,
  )
  await requireOne(
    await db.select({ id: t.clients.id }).from(t.clients).where(and(
      eq(t.clients.id, booking.clientId),
      eq(t.clients.organizationId, w.organizationId),
    )),
    `client ${booking.clientId}`,
  )

  /* What the unit is let at, unless this agreement says otherwise.
     A rate of zero used to be stored as written and raise no charge at
     all, so a tenancy could be opened against a property priced at two
     million shillings and appear on the client's account owing nothing.
     The property is the authority on what it costs; the agreement only
     overrides it deliberately. */
  const rate = booking.rate > 0 ? booking.rate : property.price
  const deposit = booking.deposit > 0
    ? booking.deposit
    : (booking.mode === 'short_stay' ? Math.round(property.price * 1.5) : property.price * 2)

  /* No transaction opened here: the request already runs inside one, so
     these writes either all land or all roll back with the rest of it. A
     second BEGIN would only be a savepoint, which reads like a transaction
     and is not one. */
  await db.insert(t.bookings).values({
    id: booking.id, organizationId: w.organizationId,
    reference: booking.reference, propertyId: booking.propertyId,
    clientId: booking.clientId, mode: booking.mode, status: booking.status,
    startsOn: booking.start, endsOn: booking.end, rate,
    deposit, advanceMonths: booking.advanceMonths,
    paidThrough: booking.paidThrough, noticeDays: booking.noticeDays,
    guests: booking.guests, source: booking.source,
    checkIn: booking.checkIn, checkOut: booking.checkOut,
    notes: booking.notes, createdAt: booking.createdAt,
  })

  /* An agreement that arrives with no charges on it raises its own, from
     the terms above. Otherwise a unit could be let and nothing ever
     billed for it — which is not a quieter kind of success. */
  if (!invoices.length) {
    const existing = await db.select({ number: t.invoices.number }).from(t.invoices)
      .where(eq(t.invoices.organizationId, w.organizationId))
    invoices = openingCharges({ ...booking, rate, deposit }, existing as Invoice[])
  }

  if (invoices.length) {
    await db.insert(t.invoices).values(invoices.map((i) => ({
      id: i.id, organizationId: w.organizationId,
      number: i.number, propertyId: i.propertyId, clientId: i.clientId,
      bookingId: i.bookingId, type: i.type, issuedOn: i.issuedOn, dueOn: i.dueOn,
      amount: i.amount, earnsFrom: i.earnsFrom, earnsTo: i.earnsTo,
      paidAmount: i.paidAmount, status: i.status, method: i.method,
      paidOn: i.paidOn, memo: i.memo,
    })))
  }

  await db.update(t.properties)
    .set({ status: booking.status === 'upcoming' ? 'reserved' : 'occupied', availableFrom: null })
    .where(eq(t.properties.id, booking.propertyId))

  await db.update(t.clients).set({ status: 'active' }).where(eq(t.clients.id, booking.clientId))

  // The link may already exist from an earlier tenancy in the same unit.
  await db.insert(t.clientProperties)
    .values({
      organizationId: w.organizationId,
      clientId: booking.clientId,
      propertyId: booking.propertyId,
    })
    .onConflictDoNothing()
}

/* ------------------------ editing and removal ---------------------- *
 * Removal is where the schema's relationships stop being theoretical.
 * A client with a tenancy behind them cannot simply vanish — their
 * charges reference them — so the refusal happens here, with a reason
 * worth reading, rather than as a foreign-key error from the driver.
 * ------------------------------------------------------------------- */

/** A refusal the caller can act on, as opposed to a fault. */
export class Conflict extends Error {}

export async function updateClient(db: Db, w: Workspace, id: string, client: Client) {
  await requireOne(
    await db.select({ id: t.clients.id }).from(t.clients)
      .where(and(eq(t.clients.id, id), eq(t.clients.organizationId, w.organizationId))),
    `client ${id}`,
  )
  await db.update(t.clients).set({
    name: client.name, kind: client.kind, email: client.email, phone: client.phone,
    nationality: client.nationality, status: client.status, notes: client.notes,
    emergencyContact: client.emergencyContact,
  }).where(eq(t.clients.id, id))

  await db.delete(t.clientProperties).where(eq(t.clientProperties.clientId, id))
  const links = [...new Set(client.propertyIds)]
    .map((propertyId) => ({ organizationId: w.organizationId, clientId: id, propertyId }))
  if (links.length) await db.insert(t.clientProperties).values(links)
}

export async function updateBooking(db: Db, w: Workspace, id: string, booking: Booking) {
  const existing = await requireOne(
    await db.select().from(t.bookings)
      .where(and(eq(t.bookings.id, id), eq(t.bookings.organizationId, w.organizationId))),
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

/* --------------------- arriving and leaving ------------------------ *
 * The two moments a letting business actually turns on, and until now
 * there was no way to record either. An agreement moved from "upcoming"
 * to "in progress" by the calendar alone, and the only way to end one was
 * to end it — which is not the same as somebody having left.
 * ------------------------------------------------------------------- */

/**
 * They arrived.
 *
 * Stamps the day, starts the agreement running and holds the unit. The
 * date is taken rather than assumed, because a guest who turns up two
 * days late did not arrive on the day the agreement says.
 */
export async function checkIn(db: Db, w: Workspace, id: string, on?: string) {
  const booking = await requireOne(
    await db.select().from(t.bookings)
      .where(and(eq(t.bookings.id, id), eq(t.bookings.organizationId, w.organizationId))),
    `agreement ${id}`,
  )
  if (booking.status === 'cancelled') {
    throw new Conflict('That agreement was cancelled, so nobody is arriving on it.')
  }
  if (booking.arrivedOn) {
    throw new Conflict(`They were already checked in on ${booking.arrivedOn}.`)
  }
  const arrivedOn = on ?? today()
  if (booking.endsOn && arrivedOn > booking.endsOn) {
    throw new Conflict('That agreement had already ended by then.')
  }

  await db.update(t.bookings)
    .set({ arrivedOn, status: 'in_progress' })
    .where(eq(t.bookings.id, id))

  await db.update(t.properties)
    .set({ status: 'occupied', availableFrom: null })
    .where(eq(t.properties.id, booking.propertyId))

  await db.update(t.clients).set({ status: 'active' }).where(eq(t.clients.id, booking.clientId))

  await db.insert(t.communications).values({
    id: `${booking.clientId}-cm-${Date.now()}`,
    organizationId: w.organizationId,
    clientId: booking.clientId,
    channel: 'note',
    direction: 'outbound',
    subject: `Checked in · ${booking.reference}`,
    preview: `Arrived ${arrivedOn}.`,
    at: today(),
    author: w.name,
  })
}

/**
 * They left.
 *
 * Ends the agreement, frees the unit from that date, and says plainly
 * what is still owed rather than quietly closing over it — a departure is
 * exactly when somebody wants to know whether the account is clear and
 * whether the deposit comes back.
 */
export async function checkOut(db: Db, w: Workspace, id: string, on?: string) {
  const booking = await requireOne(
    await db.select().from(t.bookings)
      .where(and(eq(t.bookings.id, id), eq(t.bookings.organizationId, w.organizationId))),
    `agreement ${id}`,
  )
  if (!booking.arrivedOn) {
    throw new Conflict('Nobody has checked in on that agreement yet.')
  }
  if (booking.departedOn) {
    throw new Conflict(`They already checked out on ${booking.departedOn}.`)
  }
  const departedOn = on ?? today()
  if (departedOn < booking.arrivedOn) {
    throw new Conflict('They cannot have left before they arrived.')
  }

  /* endsOn is left exactly as it was, including null on an open-ended
     rental. It is the term that was agreed; departedOn is what happened.
     Writing the departure into it would rewrite the agreement around the
     guest — and on a tenancy that ended the day it began, would write an
     end date the schema rightly refuses. */
  await db.update(t.bookings)
    .set({ departedOn, status: 'completed' })
    .where(eq(t.bookings.id, id))

  /* Free from the day they went, not from today — a departure recorded
     late should not make the unit look occupied in the meantime. */
  await db.update(t.properties)
    .set({ status: 'available', availableFrom: departedOn })
    .where(eq(t.properties.id, booking.propertyId))

  /* Their stay becomes part of the property's occupancy history, which is
     what the property record shows and what the reports read. */
  const [{ paid }] = await db.select({
    paid: sql<number>`coalesce(sum(${t.invoices.paidAmount}), 0)::int`,
  }).from(t.invoices).where(eq(t.invoices.bookingId, id))

  const [client] = await db.select({ name: t.clients.name }).from(t.clients)
    .where(eq(t.clients.id, booking.clientId))

  await db.insert(t.occupancySpells).values({
    id: `${booking.id}-spell`,
    organizationId: w.organizationId,
    propertyId: booking.propertyId,
    clientName: client?.name ?? 'Former tenant',
    startsOn: booking.arrivedOn,
    endsOn: departedOn,
    mode: booking.mode,
    revenue: Number(paid) || 0,
  }).onConflictDoNothing()

  const [{ owed }] = await db.select({
    owed: sql<number>`coalesce(sum(${t.invoices.amount} - ${t.invoices.paidAmount}), 0)::int`,
  }).from(t.invoices).where(and(
    eq(t.invoices.bookingId, id),
    sql`${t.invoices.amount} > ${t.invoices.paidAmount}`,
  ))

  await db.insert(t.communications).values({
    id: `${booking.clientId}-cm-${Date.now()}`,
    organizationId: w.organizationId,
    clientId: booking.clientId,
    channel: 'note',
    direction: 'outbound',
    subject: `Checked out · ${booking.reference}`,
    preview: Number(owed) > 0
      ? `Left ${departedOn}. ${Number(owed).toLocaleString('en-UG')} still outstanding on this agreement.`
      : `Left ${departedOn}. Nothing outstanding on this agreement.`,
    at: today(),
    author: w.name,
  })

  return { outstanding: Number(owed) || 0, deposit: booking.deposit }
}

/** Removing a property takes its agreements, charges and jobs with it. */
export async function deleteProperty(db: Db, w: Workspace, id: string) {
  await requireOne(
    await db.select({ id: t.properties.id }).from(t.properties)
      .where(and(eq(t.properties.id, id), eq(t.properties.organizationId, w.organizationId))),
    `property ${id}`,
  )
  // invoices reference clients with ON DELETE RESTRICT, so clear them first.
  await db.delete(t.invoices).where(eq(t.invoices.propertyId, id))
  await db.delete(t.bookings).where(eq(t.bookings.propertyId, id))
  await db.delete(t.properties).where(eq(t.properties.id, id))
}

export async function deleteClient(db: Db, w: Workspace, id: string) {
  await requireOne(
    await db.select({ id: t.clients.id }).from(t.clients)
      .where(and(eq(t.clients.id, id), eq(t.clients.organizationId, w.organizationId))),
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

export async function deleteBooking(db: Db, w: Workspace, id: string) {
  const booking = await requireOne(
    await db.select().from(t.bookings)
      .where(and(eq(t.bookings.id, id), eq(t.bookings.organizationId, w.organizationId))),
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

/* -------------------------------- team ----------------------------- *
 * A person and their place in a workspace are two rows now, and the
 * distinction matters. The profile is the login — one email, one
 * password, one set of linked Google and Apple accounts — and it belongs
 * to the person, not to any customer. The membership is the seat they
 * hold here, and it is what removing somebody removes.
 *
 * So an agency bookkeeper who works for two landlords signs in once and
 * switches between them, and a landlord who lets them go takes away the
 * membership without touching an account they do not own.
 * ------------------------------------------------------------------- */

/**
 * Creates a login, through the one door the database leaves open for it.
 *
 * A request scoped to a workspace may read its colleagues' profiles and
 * write none of them — so a brand-new colleague needs a function that
 * runs with the table owner's rights. That function refuses an address
 * that already exists, which is what keeps this from being a way to
 * capture somebody else's account.
 */
async function createProfile(db: Db, input: {
  id: string
  email: string
  name: string
  phone: string
  passwordHash: string | null
}) {
  await db.execute(sql`select altier_create_profile(
    ${input.id}, ${input.email}, ${input.name}, ${input.phone}, ${input.passwordHash})`)
  return input.id
}

/**
 * Adds somebody to this workspace, and refuses when the plan has no seat
 * for them or the address already belongs to somebody.
 *
 * The seat check runs inside the caller's transaction, immediately before
 * the row is written, which is what stops two owners from spending the
 * same last seat at the same moment.
 */
export async function addMember(
  db: Db, w: Workspace, member: TeamMember, passwordHash?: string,
) {
  const email = member.email.trim().toLowerCase()
  await assertSeatAvailable(db, w.organizationId, member.role)

  /* An address that already has an account belongs to a person, and this
     workspace does not get to decide they work here. Adding them directly
     would hand whoever runs this workspace a password reset for an
     account that may open somebody else's books — so that route is an
     invitation, which they accept or ignore. */
  const [existing] = await db.select({ id: t.profiles.id }).from(t.profiles)
    .where(sql`lower(${t.profiles.email}) = ${email}`)
  if (existing) {
    throw new Conflict(
      `${email} already has an Altier account. Send them an invitation instead — `
      + 'they join by accepting it.',
    )
  }

  const profileId = await createProfile(db, {
    id: `pr-${randomUUID().slice(0, 12)}`,
    email,
    name: member.name,
    phone: member.phone ?? '',
    passwordHash: passwordHash ?? null,
  })

  await db.insert(t.organizationMembers).values({
    id: member.id,
    organizationId: w.organizationId,
    profileId,
    role: member.role,
    title: member.title,
    status: 'active',
    since: member.since,
  })
  await assignProperties(db, member.id, member.role, member.propertyIds ?? [])
  return { id: member.id, profileId }
}

/**
 * Which properties a manager or staff member may touch.
 *
 * An owner and an accountant have no rows here at all, because they see
 * the whole workspace and a list would only be a second thing to keep in
 * step. For the other two the list is the access: the policies read it to
 * decide what their queries return, which is why it is rewritten whole
 * rather than added to.
 */
async function assignProperties(db: Db, memberId: string, role: Role, propertyIds: string[]) {
  await db.delete(t.memberProperties).where(eq(t.memberProperties.memberId, memberId))
  if (role !== 'manager' && role !== 'staff') return
  const rows = [...new Set(propertyIds)].filter(Boolean).map((propertyId) => ({ memberId, propertyId }))
  if (rows.length) await db.insert(t.memberProperties).values(rows)
}

export async function updateMember(db: Db, w: Workspace, id: string, member: TeamMember) {
  const existing = await requireOne(
    await db.select().from(t.organizationMembers).where(and(
      eq(t.organizationMembers.id, id),
      eq(t.organizationMembers.organizationId, w.organizationId),
    )),
    `team member ${id}`,
  )

  /* Demoting the last owner would leave the workspace with nobody who can
     manage billing, invite anybody or promote a replacement — a locked
     door with the key inside. */
  if (existing.role === 'owner' && member.role !== 'owner') {
    await assertAnotherOwner(db, w.organizationId, id,
      'This is the last owner. Make somebody else an owner first.')
  }
  /* A staff membership cannot become a tenant one: a tenant membership
     names the client whose records it may read, and there is nothing here
     to name. The check constraint on the table would refuse it anyway. */
  if (member.role === 'tenant' && existing.role !== 'tenant') {
    throw new Conflict('Tenant portal access is granted from the tenant\'s own record.')
  }
  if (member.role !== existing.role && existing.role === 'tenant') {
    throw new Conflict('A tenant login cannot be turned into a staff account. Invite them instead.')
  }

  await db.update(t.organizationMembers)
    .set({ role: member.role, title: member.title })
    .where(eq(t.organizationMembers.id, id))

  await db.update(t.profiles)
    .set({ name: member.name, phone: member.phone })
    .where(eq(t.profiles.id, existing.profileId))

  /* Omitting the list leaves the assignments alone; sending an empty one
     clears them. The difference matters — an edit that only changes a job
     title must not quietly revoke somebody's properties. */
  if (member.propertyIds) await assignProperties(db, id, member.role, member.propertyIds)
  else if (member.role !== existing.role) await assignProperties(db, id, member.role, [])
}

/**
 * Removing somebody from this workspace.
 *
 * The membership goes; the profile stays, because it may be their seat in
 * somebody else's workspace and is in any case their login, not this
 * customer's property. Their sessions here die with the membership — the
 * next request finds no active row and sees nothing.
 */
export async function deleteMember(db: Db, w: Workspace, id: string) {
  const existing = await requireOne(
    await db.select().from(t.organizationMembers).where(and(
      eq(t.organizationMembers.id, id),
      eq(t.organizationMembers.organizationId, w.organizationId),
    )),
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
  if (existing.role === 'owner') {
    await assertAnotherOwner(db, w.organizationId, id,
      'This is the last owner. A workspace cannot be left without one.')
  }

  await db.delete(t.organizationMembers).where(eq(t.organizationMembers.id, id))
  /* Whatever they were in the middle of, they are not in it any more.
     The membership row is gone, so a session pointing at this workspace
     already resolves to nothing; this closes it rather than leaving a
     cookie that looks valid until it expires. */
  await db.delete(t.sessions).where(and(
    eq(t.sessions.profileId, existing.profileId),
    eq(t.sessions.organizationId, w.organizationId),
  ))
}

/** Refuses unless somebody other than `id` is still an active owner. */
async function assertAnotherOwner(db: Db, organizationId: string, id: string, message: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(t.organizationMembers).where(and(
      eq(t.organizationMembers.organizationId, organizationId),
      eq(t.organizationMembers.role, 'owner'),
      eq(t.organizationMembers.status, 'active'),
      ne(t.organizationMembers.id, id),
    ))
  if (n === 0) throw new Conflict(message)
}

/**
 * Portal access for a tenant or guest, granted from their own record.
 *
 * Deliberately not part of the staff list: this membership names the
 * client it speaks for, and every policy in the database reads that name
 * to decide what the login may see — their agreement, their charges,
 * their documents, and nothing else in the workspace.
 */
export async function grantPortalAccess(
  db: Db, w: Workspace, clientId: string, passwordHash?: string,
) {
  const client = await requireOne(
    await db.select().from(t.clients)
      .where(and(eq(t.clients.id, clientId), eq(t.clients.organizationId, w.organizationId))),
    `client ${clientId}`,
  )
  const email = client.email.trim().toLowerCase()
  if (!email) throw new Conflict('Add an email address to this record before opening portal access.')

  await assertSeatAvailable(db, w.organizationId, 'tenant')

  const existingPortal = await db.select({ id: t.organizationMembers.id })
    .from(t.organizationMembers).where(and(
      eq(t.organizationMembers.organizationId, w.organizationId),
      eq(t.organizationMembers.clientId, clientId),
    ))
  if (existingPortal.length) throw new Conflict('That record already has portal access.')

  const [existing] = await db.select({ id: t.profiles.id }).from(t.profiles)
    .where(sql`lower(${t.profiles.email}) = ${email}`)
  if (existing) {
    throw new Conflict(
      `${email} already has an Altier account, so portal access has to be `
      + 'invited rather than created here.',
    )
  }
  const profileId = await createProfile(db, {
    id: `pr-${randomUUID().slice(0, 12)}`,
    email,
    name: client.name,
    phone: client.phone ?? '',
    passwordHash: passwordHash ?? null,
  })

  const id = `om-${randomUUID().slice(0, 12)}`
  await db.insert(t.organizationMembers).values({
    id,
    organizationId: w.organizationId,
    profileId,
    role: 'tenant' as Role,
    title: 'Tenant portal',
    status: 'active',
    since: today(),
    clientId,
  })
  return { id, profileId }
}

/** Closing a portal login. The client record itself is untouched. */
export async function revokePortalAccess(db: Db, w: Workspace, clientId: string) {
  const rows = await db.select().from(t.organizationMembers).where(and(
    eq(t.organizationMembers.organizationId, w.organizationId),
    eq(t.organizationMembers.clientId, clientId),
  ))
  const membership = rows[0]
  if (!membership) throw new NotFound('That record has no portal access.')
  await db.delete(t.organizationMembers).where(eq(t.organizationMembers.id, membership.id))
  await db.delete(t.sessions).where(and(
    eq(t.sessions.profileId, membership.profileId),
    eq(t.sessions.organizationId, w.organizationId),
  ))
}

const describe = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`
