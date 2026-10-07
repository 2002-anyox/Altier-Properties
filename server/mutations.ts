/* ------------------------------------------------------------------ *
 * Mutations
 *
 * These mirror the reducer in src/lib/store.tsx exactly. The client still
 * applies each change optimistically so the interface stays instant; the
 * server is the authority, and every handler returns the refreshed
 * portfolio so the two can never drift.
 * ------------------------------------------------------------------ */

import { randomUUID } from 'node:crypto'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db } from './db/client.js'
import * as t from './db/schema.js'
import { openingCharges, settlementCharges } from '../src/lib/create.js'
import { dayIn } from '../src/lib/dates.js'
import { holdBlocking, whyBlocked } from '../src/lib/occupancy.js'
import { stayWindow } from '../src/lib/stay.js'
import { assertSeatAvailable } from './workspace.js'
import type {
  Booking, Client, Invoice, MaintenanceCategory, MaintenancePriority, MaintenanceStatus,
  PaymentMethod, Property, PropertyStatus, ReminderSettings, Role, TeamMember,
} from '../src/lib/types.js'
import { MAINTENANCE_CATEGORIES } from '../src/lib/types.js'
import { TRADE_FOR } from '../src/lib/labels.js'

/**
 * The calendar day where the workspace is.
 *
 * Not UTC. A payment taken at one in the morning in Kampala is a payment
 * taken that day, and storing it as the previous one — because UTC had
 * not reached midnight yet — put the ledger a day behind the screen,
 * which reads the browser's own calendar. en-CA is the shortest way to
 * ask Intl for a 'YYYY-MM-DD'.
 */
const today = (w: Workspace) => dayIn(w.timezone)

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
  /** Which calendar "today" means here — see today(w) below. */
  timezone: string
}

export class NotFound extends Error {}

/**
 * The agreement, held for the rest of the transaction.
 *
 * Every arrival and departure is a read, a guard on what the read said,
 * and then a write — and the guard is worthless if another request can
 * read the same row in between. It could: scope.ts opens an ordinary
 * READ COMMITTED transaction, so two check-outs both saw departedOn as
 * null, both passed, and both raised a settlement. Two credit notes for
 * one departure, which a double-click was enough to produce.
 *
 * `for update` makes the second caller wait for the first to commit, so
 * it reads the departure that just happened and refuses on it. Safe to
 * use everywhere here: inWorkspace has already opened the transaction
 * this takes its lifetime from.
 */
async function lockBooking(db: Db, w: Workspace, id: string) {
  return requireOne(
    await db.select().from(t.bookings)
      .where(and(eq(t.bookings.id, id), eq(t.bookings.organizationId, w.organizationId)))
      .for('update'),
    `agreement ${id}`,
  )
}

/**
 * A figure or a date the caller got wrong.
 *
 * The routes check the shape of a body themselves; this is for the
 * refusals that need the records to decide — an amount larger than the
 * charge owes, a payment dated tomorrow — and so can only be made down
 * here. Answered as 400, the same as its counterpart upstairs.
 */
export class BadInput extends Error {}

async function requireOne<T>(rows: T[], what: string): Promise<T> {
  const row = rows[0]
  if (!row) throw new NotFound(`${what} not found`)
  return row
}

export interface Payment {
  /** Omitted settles whatever is still outstanding, which is what the
   *  one-press "Record payment" in the ledger means. */
  amount?: number
  method?: PaymentMethod
  /** The day the money moved, which may be before today and never after. */
  paidOn?: string
}

/**
 * Money against a charge.
 *
 * Takes an amount rather than assuming the whole thing: a part payment is
 * ordinary, and recording it as settled in full loses the arrears. The
 * figures are the server's — the request may say how much was received,
 * never what the charge was worth.
 *
 * A credit note is the same operation pointing the other way: paying one
 * is money leaving. So it carries a ceiling the others do not, because a
 * refund can only return what actually came in — see below.
 */
export async function recordPayment(
  db: Db, w: Workspace, invoiceId: string, payment: Payment = {},
) {
  const invoice = await requireOne(
    await db.select().from(t.invoices)
      .where(and(eq(t.invoices.id, invoiceId), eq(t.invoices.organizationId, w.organizationId))),
    `invoice ${invoiceId}`,
  )

  const outstanding = invoice.amount - invoice.paidAmount
  if (outstanding <= 0) {
    throw new Conflict(`${invoice.number} is already settled in full.`)
  }

  let amount = payment.amount ?? outstanding
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BadInput('A payment has to be a whole number of shillings above zero.')
  }
  if (amount > outstanding) {
    throw new BadInput(
      `${invoice.number} has ${outstanding} outstanding, so ${amount} is more than it owes.`,
    )
  }

  /* The one ceiling that is not just arithmetic on this row.
     A credit note offsets a charge, and its face value is the right
     offset whether or not the charge was ever collected — that is what
     makes the two net to nothing when a stay is cancelled unpaid. But
     *paying* a credit note is cash going back out of the door, and there
     is nothing to send back until some came in. Unguarded, a guest who
     booked ten nights, paid nothing and left on the first day could be
     refunded the whole ten, while still owing them. */
  if (invoice.type === 'credit_note') {
    const { refundable, returned } = await refundableAgainst(db, w, invoice)
    if (refundable <= 0) {
      throw new Conflict(returned > 0
        ? `Everything collected on this agreement has already been returned (${returned}).`
        : `Nothing has been collected on this agreement, so there is nothing to refund. `
          + `${invoice.number} already cancels what was charged.`)
    }
    if (amount > refundable) {
      throw new BadInput(
        `Only ${refundable} has been collected on this agreement, so ${amount} is more `
        + 'than there is to return.',
      )
    }
  }

  const paidOn = payment.paidOn ?? today(w)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    throw new BadInput('A payment date has to be a calendar date, as YYYY-MM-DD.')
  }
  if (paidOn > today(w)) {
    throw new BadInput('A payment cannot be recorded for a day that has not happened yet.')
  }

  const paidAmount = invoice.paidAmount + amount
  await db.update(t.invoices).set({
    status: paidAmount >= invoice.amount ? 'paid' : 'partial',
    paidAmount,
    paidOn,
    method: payment.method ?? invoice.method ?? 'bank_transfer',
  }).where(eq(t.invoices.id, invoiceId))
}

/**
 * What can still be sent back.
 *
 * Everything collected on the agreement the credit note belongs to, less
 * everything already returned against it. Scoped to the agreement when
 * the note names one and to the client when it does not, so a note left
 * unlinked by a deleted agreement still has a ledger to answer to.
 */
async function refundableAgainst(
  db: Db, w: Workspace, note: typeof t.invoices.$inferSelect,
): Promise<{ refundable: number; returned: number }> {
  const scope = note.bookingId
    ? eq(t.invoices.bookingId, note.bookingId)
    : eq(t.invoices.clientId, note.clientId)
  const [sums] = await db.select({
    collected: sql<number>`coalesce(sum(
      case when ${t.invoices.type} <> 'credit_note' then ${t.invoices.paidAmount} else 0 end
    ), 0)::int`,
    returned: sql<number>`coalesce(sum(
      case when ${t.invoices.type} = 'credit_note' then ${t.invoices.paidAmount} else 0 end
    ), 0)::int`,
  }).from(t.invoices)
    .where(and(eq(t.invoices.organizationId, w.organizationId), scope))
  const collected = sums?.collected ?? 0
  const returned = sums?.returned ?? 0
  return { refundable: Math.max(0, collected - returned), returned }
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
    at: today(w),
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
    availableFrom: status === 'available' ? today(w) : property.availableFrom,
  }).where(eq(t.properties.id, id))
}

export async function setMaintenanceStatus(
  db: Db, w: Workspace, id: string, status: MaintenanceStatus, actualCost?: number | null,
) {
  const request = await requireOne(
    await db.select().from(t.maintenanceRequests).where(and(
      eq(t.maintenanceRequests.id, id),
      eq(t.maintenanceRequests.organizationId, w.organizationId),
    )),
    `maintenance request ${id}`,
  )
  const completing = status === 'completed'
  /* What it cost is what somebody says it cost. The old code copied the
     estimate across on completion, which put a guess in the column the
     spend figure sums and left no way to tell the two apart. Absent, it
     stays absent — "not yet invoiced" is true, and a number nobody
     checked is not. */
  const settled = actualCost === undefined
    ? request.actualCost
    : (actualCost === null ? null : Math.max(0, Math.round(actualCost)))

  await db.update(t.maintenanceRequests).set({
    status,
    completedOn: completing ? today(w) : null,
    actualCost: settled,
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
    at: today(w),
    label: completing && settled !== null
      ? `Completed · ${settled.toLocaleString('en-UG')} invoiced`
      : `Status changed to ${status.replace(/_/g, ' ')}`,
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
  /** Who is doing it. Left out, it sits with whoever logged it. */
  assigneeId?: string
  /** What it is expected to cost. This is what the board commits. */
  estimatedCost?: number
  /** What kind of job it is; the trade sent for it follows from this. */
  category?: MaintenanceCategory
}

export async function addMaintenance(db: Db, w: Workspace, input: NewMaintenance) {
  /* The request body is the only thing standing between this insert and
     the database, so its shape is checked here rather than discovered as
     a constraint violation with the statement attached. */
  const title = String(input.title ?? '').trim()
  if (!title) throw new BadInput('A job needs a title saying what needs doing.')
  if (title.length > 200) throw new BadInput('Keep the title under 200 characters; detail goes below it.')
  const priority = input.priority as string
  if (!['urgent', 'high', 'medium', 'low'].includes(priority)) {
    throw new BadInput('A priority has to be urgent, high, medium or low.')
  }
  const category = (input.category ?? 'structural') as string
  if (!(MAINTENANCE_CATEGORIES as readonly string[]).includes(category)) {
    throw new BadInput(`A category has to be one of ${MAINTENANCE_CATEGORIES.join(', ')}.`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.dueOn ?? ''))) {
    throw new BadInput('A target date has to be a calendar date, as YYYY-MM-DD.')
  }
  const estimate = input.estimatedCost === undefined ? 0 : Number(input.estimatedCost)
  if (!Number.isFinite(estimate) || estimate < 0) {
    throw new BadInput('An estimate has to be zero or more.')
  }
  /* The property has to be one this workspace holds. A job against
     nothing used to be accepted by the form and refused by a foreign key,
     after the board had already announced it. */
  await requireOne(
    await db.select({ id: t.properties.id }).from(t.properties).where(and(
      eq(t.properties.id, String(input.propertyId ?? '')),
      eq(t.properties.organizationId, w.organizationId),
    )),
    `property ${input.propertyId}`,
  )

  /* The next number after the highest one taken, not one more than how
     many there are. Counting worked until something was deleted — a
     property going takes its jobs with it — after which the count fell
     behind the numbers already used, the next reference collided with
     one that existed, and so did every one after it. Maintenance stopped
     being creatable at all, permanently, from one deletion. */
  const [{ top }] = await db.select({
    top: sql<number>`coalesce(max(nullif(regexp_replace(${t.maintenanceRequests.reference}, '\\D', '', 'g'), '')::int), 3399)`,
  }).from(t.maintenanceRequests)
    .where(eq(t.maintenanceRequests.organizationId, w.organizationId))
  const id = `m-${randomUUID().slice(0, 12)}`
  const reference = `MNT-${Number(top) + 1}`

  await db.insert(t.maintenanceRequests).values({
    id,
    organizationId: w.organizationId,
    reference,
    propertyId: input.propertyId,
    title,
    description: String(input.description ?? '').trim() || 'Logged from the maintenance board.',
    category: category as MaintenanceCategory,
    priority: priority as MaintenancePriority,
    status: 'reported',
    vendor: String(input.vendor ?? '').trim(),
    trade: TRADE_FOR[category as MaintenanceCategory],
    assigneeId: await assignableTo(db, w, input.assigneeId),
    reportedBy: w.name,
    reportedOn: today(w),
    dueOn: input.dueOn,
    completedOn: null,
    estimatedCost: Math.round(estimate),
    actualCost: null,
  })
  await db.insert(t.maintenanceEvents).values({
    id: `${id}-event-0`, organizationId: w.organizationId, requestId: id, position: 0,
    at: today(w), label: 'Request logged', by: w.name,
  })
  return id
}

/**
 * Who a job may be handed to.
 *
 * A colleague in this workspace, or nobody named — in which case it sits
 * with whoever logged it, which is at least somebody real. The check is
 * here rather than in the form because the form is not what stops a
 * request naming a member of another landlord's staff.
 */
async function assignableTo(db: Db, w: Workspace, assigneeId?: string) {
  if (!assigneeId) return w.memberId
  const rows = await db.select({ id: t.organizationMembers.id })
    .from(t.organizationMembers).where(and(
      eq(t.organizationMembers.id, assigneeId),
      eq(t.organizationMembers.organizationId, w.organizationId),
      ne(t.organizationMembers.role, 'tenant'),
    ))
  if (!rows.length) throw new NotFound(`team member ${assigneeId} not found`)
  return assigneeId
}

/**
 * Handing a job to somebody else, and saying so on its timeline.
 *
 * A reassignment is a thing that happened to the job, so it belongs in
 * the history rather than only in the current value of a column.
 */
export async function reassignMaintenance(
  db: Db, w: Workspace, id: string, assigneeId: string,
) {
  const request = await requireOne(
    await db.select().from(t.maintenanceRequests).where(and(
      eq(t.maintenanceRequests.id, id),
      eq(t.maintenanceRequests.organizationId, w.organizationId),
    )),
    `maintenance request ${id}`,
  )
  const next = await assignableTo(db, w, assigneeId)
  if (next === request.assigneeId) return

  const [who] = await db.select({ name: t.profiles.name })
    .from(t.organizationMembers)
    .innerJoin(t.profiles, eq(t.profiles.id, t.organizationMembers.profileId))
    .where(eq(t.organizationMembers.id, next))

  await db.update(t.maintenanceRequests)
    .set({ assigneeId: next })
    .where(eq(t.maintenanceRequests.id, id))

  const [{ position }] = await db
    .select({ position: sql<number>`coalesce(max(${t.maintenanceEvents.position}), -1) + 1` })
    .from(t.maintenanceEvents)
    .where(eq(t.maintenanceEvents.requestId, id))

  await db.insert(t.maintenanceEvents).values({
    id: `${id}-event-${position}`,
    organizationId: w.organizationId,
    requestId: id,
    position: Number(position),
    at: today(w),
    label: `Assigned to ${who?.name ?? 'a colleague'}`,
    by: w.name,
  })
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
    at: today(w),
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
  latitude: p.address.lat ?? null, longitude: p.address.lng ?? null,
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
  /* A manager sees the properties assigned to them, and a property nobody
     has been assigned to yet is invisible to the manager who just created
     it — so before anything else is written against it, it is theirs.
     The function decides; for an owner or accountant it does nothing. */
  await db.execute(sql`select altier_claim_property(${property.id})`)
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
  /* Every unit named has to be one this person looks after. Checked here,
     where it can be said plainly, rather than left to the policy on the
     link table, which would refuse just the same with less to go on. */
  const wanted = [...new Set(client.propertyIds ?? [])]
  if (wanted.length) {
    const visible = await db.select({ id: t.properties.id }).from(t.properties)
      .where(and(
        eq(t.properties.organizationId, w.organizationId),
        inArray(t.properties.id, wanted),
      ))
    const missing = wanted.filter((id) => !visible.some((v) => v.id === id))
    if (missing.length) throw new NotFound(`property ${missing[0]} not found`)
  }

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

  /* A manager sees the clients linked to their properties. One created
     with no link would be saved and then vanish from the list of the
     person who made it — and could never be booked, because the booking
     form can only offer clients it can see. Refused instead, which rolls
     the whole insert back. An owner sees every client, so this never
     fires for them. */
  const [seen] = await db.select({ id: t.clients.id }).from(t.clients)
    .where(eq(t.clients.id, client.id))
  if (!seen) {
    throw new BadInput(
      'Link this client to one of the properties you look after, or you will not be '
      + 'able to see them once they are saved.',
    )
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
  /* Held for the transaction, because the one-home rule below is a read
     of this client's agreements followed by an insert, and without the
     lock two requests arriving together both read "not housed" and both
     went ahead — reproducibly, four times out of four. The client is the
     right row to serialise on: the rule is about them, not the unit. */
  const client = await requireOne(
    await db.select({ id: t.clients.id, name: t.clients.name }).from(t.clients).where(and(
      eq(t.clients.id, booking.clientId),
      eq(t.clients.organizationId, w.organizationId),
    )).for('update'),
    `client ${booking.clientId}`,
  )

  /* A client holds one home at a time. Placing somebody who has not moved
     out of their last unit is nearly always the wrong name picked off a
     list, and it would raise a second set of charges against them — rent
     for two homes, from one mis-click. Checked here rather than only in
     the form, because the form is a convenience and this is the rule. */
  await assertNotAlreadyHoused(db, w, booking, client.name)

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

/**
 * Refuses to place a client who is still in somewhere else.
 *
 * Reads the agreements rather than the client_properties links: a link
 * is a connection — enquired, viewed, used to live there — and several
 * are perfectly ordinary. An agreement that has not been closed or
 * checked out of is a home somebody is living in, and there is only one
 * of those at a time.
 */
async function assertNotAlreadyHoused(
  db: Db, w: Workspace, booking: Booking, clientName: string,
) {
  const held = await db.select({
    id: t.bookings.id,
    propertyId: t.bookings.propertyId,
    clientId: t.bookings.clientId,
    status: t.bookings.status,
    departedOn: t.bookings.departedOn,
    reference: t.bookings.reference,
  }).from(t.bookings).where(and(
    eq(t.bookings.clientId, booking.clientId),
    eq(t.bookings.organizationId, w.organizationId),
  ))

  const blocking = holdBlocking(held, booking.clientId, booking.propertyId)
  if (!blocking) return

  const [into] = await db.select({ name: t.properties.name }).from(t.properties)
    .where(eq(t.properties.id, booking.propertyId))
  const [already] = await db.select({ name: t.properties.name }).from(t.properties)
    .where(eq(t.properties.id, blocking.propertyId))

  throw new Conflict(whyBlocked(
    clientName,
    already?.name ?? 'their current home',
    into?.name ?? 'another unit',
  ))
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
  const existing = await lockBooking(db, w, id)
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
  const booking = await lockBooking(db, w, id)
  if (booking.status === 'cancelled') {
    throw new Conflict('That agreement was cancelled, so nobody is arriving on it.')
  }
  if (booking.arrivedOn) {
    throw new Conflict(`They were already checked in on ${booking.arrivedOn}.`)
  }
  const arrivedOn = on ?? today(w)
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
    at: today(w),
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
export async function checkOut(
  db: Db, w: Workspace, id: string, on?: string, settle = true,
) {
  const booking = await lockBooking(db, w, id)
  if (!booking.arrivedOn) {
    throw new Conflict('Nobody has checked in on that agreement yet.')
  }
  if (booking.departedOn) {
    throw new Conflict(`They already checked out on ${booking.departedOn}.`)
  }
  const departedOn = on ?? today(w)
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

  /* The bill follows the days, not the plan.
     A stay is priced before anybody has stayed in it, so a departure is
     the first moment the real number is knowable. Whatever was charged
     for days nobody used comes back as a credit note, and whatever was
     lived through and never billed is charged at the rate that was
     already running. Both are new documents: the charges already sent
     stand exactly as they were sent.
     Computed here rather than taken from the request — this is money, and
     the client may propose a departure date but never an amount. */
  const daysStayed = stayWindow(
    { start: booking.startsOn, arrivedOn: booking.arrivedOn, departedOn },
    departedOn,
  ).days
  const settlement = settle
    ? await settleOnDeparture(db, w, booking, departedOn)
    : { credit: 0, due: 0, raised: [] as Invoice[] }

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

  /* What the account comes to now the adjustment is on it. A credit note
     counts the other way, so a guest who overpaid for days they did not
     use lands on a negative balance — money owed back rather than owed. */
  const [{ owed }] = await db.select({
    owed: sql<number>`coalesce(sum(
      (case when ${t.invoices.type} = 'credit_note' then -1 else 1 end)
      * (${t.invoices.amount} - ${t.invoices.paidAmount})
    ), 0)::int`,
  }).from(t.invoices).where(and(
    eq(t.invoices.bookingId, id),
    sql`${t.invoices.amount} > ${t.invoices.paidAmount}`,
  ))

  const balance = Number(owed) || 0
  const adjustment = settlement.credit > 0
    ? ` ${settlement.credit.toLocaleString('en-UG')} credited for days not used.`
    : settlement.due > 0
      ? ` ${settlement.due.toLocaleString('en-UG')} charged for days beyond the agreement.`
      : ''

  await db.insert(t.communications).values({
    id: `${booking.clientId}-cm-${Date.now()}`,
    organizationId: w.organizationId,
    clientId: booking.clientId,
    channel: 'note',
    direction: 'outbound',
    subject: `Checked out · ${booking.reference}`,
    preview: `Left ${departedOn}.${adjustment} ${
      balance > 0
        ? `${balance.toLocaleString('en-UG')} still outstanding on this agreement.`
        : balance < 0
          ? `${Math.abs(balance).toLocaleString('en-UG')} is owed back to them.`
          : 'Nothing outstanding on this agreement.'
    }`.trim(),
    at: today(w),
    author: w.name,
  })

  return {
    outstanding: balance,
    deposit: booking.deposit,
    credit: settlement.credit,
    due: settlement.due,
    daysStayed,
    adjusted: settlement.raised.length,
  }
}

/**
 * Work out what the days actually spent come to, and raise the difference.
 *
 * Reads the agreement's own charges back out of the ledger and hands them
 * to the same settlement function the check-out screen used to show the
 * figure, so what somebody was shown before they pressed the button is
 * what lands on the account after they did.
 */
async function settleOnDeparture(
  db: Db, w: Workspace, booking: typeof t.bookings.$inferSelect, departedOn: string,
) {
  /* Two reads rather than one: the agreement's own charges in full,
     because the arithmetic needs their amounts and earning windows, and
     nothing but the numbers from the rest of the workspace, because all
     the numbering needs is the highest one already taken. Pulling every
     column of every invoice a landlord has ever raised would work, and
     would get slower every month they stayed in business. */
  const mine = await db.select().from(t.invoices)
    .where(and(eq(t.invoices.organizationId, w.organizationId), eq(t.invoices.bookingId, booking.id)))
  const numbers = await db.select({ number: t.invoices.number }).from(t.invoices)
    .where(eq(t.invoices.organizationId, w.organizationId))

  const raised = settlementCharges(
    {
      id: booking.id,
      reference: booking.reference,
      propertyId: booking.propertyId,
      clientId: booking.clientId,
      mode: booking.mode,
      rate: booking.rate,
      start: booking.startsOn,
      end: booking.endsOn,
      arrivedOn: booking.arrivedOn,
      /* The departure being recorded now, not the one on the row — the
         update above has landed, but this is clearer than relying on it. */
      departedOn,
    } as Booking,
    mine as unknown as Invoice[],
    departedOn,
    numbers as Invoice[],
  )

  if (raised.length) {
    await db.insert(t.invoices).values(raised.map((i) => ({
      id: i.id, organizationId: w.organizationId,
      number: i.number, propertyId: i.propertyId, clientId: i.clientId,
      bookingId: i.bookingId, type: i.type, issuedOn: i.issuedOn, dueOn: i.dueOn,
      amount: i.amount, earnsFrom: i.earnsFrom, earnsTo: i.earnsTo,
      paidAmount: i.paidAmount, status: i.status, method: i.method,
      paidOn: i.paidOn, memo: i.memo,
    })))
  }

  return {
    credit: raised.filter((i) => i.type === 'credit_note').reduce((a, i) => a + i.amount, 0),
    due: raised.filter((i) => i.type !== 'credit_note').reduce((a, i) => a + i.amount, 0),
    raised,
  }
}

/** Removing a property takes its agreements, charges and jobs with it. */
export async function deleteProperty(db: Db, w: Workspace, id: string) {
  await requireOne(
    await db.select({ id: t.properties.id }).from(t.properties)
      .where(and(eq(t.properties.id, id), eq(t.properties.organizationId, w.organizationId))),
    `property ${id}`,
  )
  const [{ n: agreements }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(t.bookings).where(eq(t.bookings.propertyId, id))
  const [{ n: charges }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(t.invoices).where(eq(t.invoices.propertyId, id))

  /* The same rule a client has, for the same reason. This used to delete
     every charge on the unit first — paid ones included — so removing a
     property erased the record of money that had actually moved, and
     a manager scoped to one unit could take seventeen invoices with it.
     A property with history is retired, not removed. */
  if (agreements > 0 || charges > 0) {
    throw new Conflict(
      `${describe(agreements, 'agreement')} and ${describe(charges, 'charge')} reference this property, `
      + 'so removing it would destroy that history. Mark it inactive instead.',
    )
  }

  /* Nothing financial left, so what remains is the property's own detail
     and the access granted to it. The access rows carry no foreign key,
     and left behind they handed a re-created property with the same id
     straight back to whoever was assigned the old one. */
  await db.delete(t.memberProperties).where(eq(t.memberProperties.propertyId, id))
  await db.delete(t.invitationProperties).where(eq(t.invitationProperties.propertyId, id))
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

  /* A portal login is granted from this record and has to leave with it.
     Left behind, it kept working: it reached whatever record next took
     this id, because the policy matches on the id and ids are supplied by
     the caller. And with the record gone there was no longer a screen to
     close it from. The foreign key added in 0013 is the backstop; this is
     the part that also ends the sessions and retires the account. */
  const [portal] = await db.select({
    id: t.organizationMembers.id,
    profileId: t.organizationMembers.profileId,
  })
    .from(t.organizationMembers).where(and(
      eq(t.organizationMembers.organizationId, w.organizationId),
      eq(t.organizationMembers.clientId, id),
    ))
  if (portal) await retirePortalLogin(db, w, portal)

  await db.delete(t.clients).where(eq(t.clients.id, id))
}

export async function deleteBooking(db: Db, w: Workspace, id: string) {
  const booking = await lockBooking(db, w, id)

  /* Deleting is for an agreement that should never have been recorded:
     nobody moved in and no money moved. Anything else is history, and
     history is ended, not erased — the same rule a client and a property
     already keep.

     The old rule tried to have it both ways. Unpaid charges went with the
     agreement and paid ones stayed behind unlinked, which left orphans in
     the ledger belonging to no agreement; a pending credit note — a refund
     the business owes — counted as unpaid and was silently destroyed; and
     once a credit note had been refunded the unlinking broke the
     constraint that a credit note names its agreement, so the delete
     failed with a raw database message and could never succeed. */
  const charges = await db.select({
    type: t.invoices.type, paidAmount: t.invoices.paidAmount,
  }).from(t.invoices).where(eq(t.invoices.bookingId, id))
  const paid = charges.filter((c) => c.paidAmount > 0).length
  const credits = charges.filter((c) => c.type === 'credit_note').length
  if (booking.arrivedOn || paid > 0 || credits > 0) {
    const why = [
      booking.arrivedOn && `they checked in on ${booking.arrivedOn}`,
      paid > 0 && `${describe(paid, 'charge')} with money against ${paid === 1 ? 'it' : 'them'}`,
      credits > 0 && `${describe(credits, 'credit note')}`,
    ].filter(Boolean).join(', ')
    throw new Conflict(
      `${booking.reference} has history — ${why} — so it is kept. End it instead.`,
    )
  }

  /* A mistake, then. Every charge on it is unpaid, and was only ever an
     expectation this agreement created, so it goes with it rather than
     leaving arrears behind that nobody owes. */
  await db.delete(t.invoices).where(eq(t.invoices.bookingId, id))
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

  /* Asked through a function that reads unscoped, because a plain select
     here only ever saw this workspace's own profiles. For anybody else's
     address it found nothing, carried on, and the insert raised — a 500
     with the statement and the password hash in it, where this refusal
     was what the code meant to do. */
  const [{ taken }] = await db.select({
    taken: sql<boolean>`altier_profile_exists(${email})`,
  }).from(sql`(select 1) as one`)
  if (taken) {
    throw new Conflict(
      `${email} already has an Altier account. Portal access creates a new `
      + 'login, so it cannot use that address — give this record an address '
      + 'of its own, or ask them to sign in with the account they have.',
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
    since: today(w),
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
  await retirePortalLogin(db, w, membership)
}

/**
 * Taking a portal login out of service.
 *
 * Removing the membership alone used to leave the profile and its
 * password behind, which had two costs: the credentials still
 * authenticated — reaching nothing, but answering — and granting access
 * again collided with the leftover profile and failed. So the account
 * goes too, once we are sure it exists for nothing else.
 *
 * "Nothing else" is read unscoped on purpose. A tenant who is also a
 * landlord in another workspace, or who signs in with Google, owns that
 * account beyond this record, and this workspace does not get to delete
 * it — the membership is withdrawn and the account is left alone.
 */
async function retirePortalLogin(
  db: Db, w: Workspace, membership: { id: string; profileId: string },
) {
  const [elsewhere] = await db.select({ n: sql<number>`count(*)::int` })
    .from(t.organizationMembers)
    .where(and(
      eq(t.organizationMembers.profileId, membership.profileId),
      ne(t.organizationMembers.id, membership.id),
    ))
  const [linked] = await db.select({ n: sql<number>`count(*)::int` })
    .from(t.identities)
    .where(eq(t.identities.profileId, membership.profileId))

  if ((elsewhere?.n ?? 0) === 0 && (linked?.n ?? 0) === 0) {
    /* The account exists for this record and nothing else, so it goes.
       Order matters and is easy to get wrong: a profile is visible to
       this caller *because* of the membership, so deleting the membership
       first puts the profile out of reach and the delete below matches
       nothing — quietly, which is how the login survived its own
       revocation. Deleting the profile while the membership still stands
       takes the membership, the sessions and every way back in with it,
       by cascade. */
    await db.delete(t.profiles).where(eq(t.profiles.id, membership.profileId))
    return
  }

  /* The account lives on for its other work — another workspace, or a
     Google sign-in — so this workspace withdraws the membership and ends
     its own sessions, and leaves the account alone. */
  await db.delete(t.organizationMembers).where(eq(t.organizationMembers.id, membership.id))
  await db.delete(t.sessions).where(and(
    eq(t.sessions.profileId, membership.profileId),
    eq(t.sessions.organizationId, w.organizationId),
  ))
}

const describe = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`
