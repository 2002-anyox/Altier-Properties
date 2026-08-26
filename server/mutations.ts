/* ------------------------------------------------------------------ *
 * Mutations
 *
 * These mirror the reducer in src/lib/store.tsx exactly. The client still
 * applies each change optimistically so the interface stays instant; the
 * server is the authority, and every handler returns the refreshed
 * portfolio so the two can never drift.
 * ------------------------------------------------------------------ */

import { eq, sql } from 'drizzle-orm'
import type { Db } from './db/client.ts'
import * as t from './db/schema.ts'
import type {
  MaintenancePriority, MaintenanceStatus, PropertyStatus, ReminderSettings,
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
