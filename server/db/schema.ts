/* ------------------------------------------------------------------ *
 * Altier Properties — relational schema
 *
 * Mirrors src/lib/types.ts. The domain's string unions become Postgres
 * enums so the database rejects what TypeScript already rejects, and the
 * arrays embedded in the in-memory model become child tables.
 *
 * Money is held in the base currency (Ugandan shillings) as whole units —
 * UGX has no minor unit in practice. Presentation currency is a client
 * concern and is deliberately not stored per row.
 *
 * Notifications are absent on purpose: they are derived from invoices,
 * bookings and properties, so a table would go stale the moment any of
 * those changed.
 * ------------------------------------------------------------------ */

import {
  bigint, boolean, check, date, index, integer, jsonb, pgEnum, pgTable,
  primaryKey, real, text, time, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

/* ------------------------------- enums ----------------------------- */
export const roleEnum = pgEnum('role', ['owner', 'manager', 'staff', 'accountant'])
export const propertyStatusEnum = pgEnum('property_status', [
  'available', 'occupied', 'reserved', 'maintenance', 'inactive',
])
export const propertyTypeEnum = pgEnum('property_type', [
  'apartment', 'house', 'villa', 'serviced', 'short_stay', 'commercial',
])
export const tenancyModeEnum = pgEnum('tenancy_mode', ['long_term', 'rental', 'short_stay'])
export const clientKindEnum = pgEnum('client_kind', ['tenant', 'guest', 'corporate', 'owner'])
export const clientStatusEnum = pgEnum('client_status', ['active', 'past', 'prospect'])
export const bookingStatusEnum = pgEnum('booking_status', [
  'upcoming', 'in_progress', 'completed', 'cancelled', 'pending',
])
export const bookingSourceEnum = pgEnum('booking_source', [
  'direct', 'airbnb', 'booking_com', 'agency', 'corporate',
])
export const invoiceStatusEnum = pgEnum('invoice_status', [
  'paid', 'pending', 'overdue', 'upcoming', 'partial',
])
export const chargeTypeEnum = pgEnum('charge_type', [
  'rent', 'advance', 'booking', 'deposit', 'utilities', 'service_fee',
  'late_fee', 'maintenance_recharge',
])
export const paymentMethodEnum = pgEnum('payment_method', [
  'bank_transfer', 'card', 'mobile_money', 'cash',
])
export const documentCategoryEnum = pgEnum('document_category', [
  'lease', 'title', 'insurance', 'inspection', 'compliance', 'invoice', 'id',
])
export const commChannelEnum = pgEnum('comm_channel', ['email', 'call', 'sms', 'note', 'portal'])
export const commDirectionEnum = pgEnum('comm_direction', ['inbound', 'outbound'])
export const maintenancePriorityEnum = pgEnum('maintenance_priority', ['urgent', 'high', 'medium', 'low'])
export const maintenanceStatusEnum = pgEnum('maintenance_status', [
  'reported', 'scheduled', 'in_progress', 'awaiting_parts', 'completed',
])
export const maintenanceCategoryEnum = pgEnum('maintenance_category', [
  'plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'cleaning', 'safety', 'grounds',
])

/** Whole units of the base currency. */
const money = (name: string) => bigint(name, { mode: 'number' })

/* ------------------------------- team ------------------------------ */
export const teamMembers = pgTable('team_members', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull(),
  title: text('title').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull(),
  since: date('since', { mode: 'string' }).notNull(),
})

/* ---------------------------- properties --------------------------- */
export const properties = pgTable('properties', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  type: propertyTypeEnum('type').notNull(),
  mode: tenancyModeEnum('mode').notNull(),
  status: propertyStatusEnum('status').notNull(),

  addressLine1: text('address_line1').notNull(),
  district: text('district').notNull(),
  city: text('city').notNull(),
  country: text('country').notNull(),
  /** Normalised 0–1 coordinates for the schematic portfolio map. */
  mapX: real('map_x').notNull(),
  mapY: real('map_y').notNull(),

  bedrooms: integer('bedrooms').notNull(),
  bathrooms: integer('bathrooms').notNull(),
  sizeSqm: integer('size_sqm').notNull(),
  /** Monthly rent for leases and rentals; nightly rate for short stays. */
  price: money('price').notNull(),
  managerId: text('manager_id').notNull().references(() => teamMembers.id),
  rating: real('rating').notNull(),
  /** The date the unit frees up; null while it is committed. */
  availableFrom: date('available_from', { mode: 'string' }),
  acquiredOn: date('acquired_on', { mode: 'string' }).notNull(),
  yieldPct: real('yield_pct').notNull(),
  notes: text('notes').notNull(),
  photoSeed: integer('photo_seed').notNull(),
}, (t) => [
  index('properties_status_idx').on(t.status),
  index('properties_mode_idx').on(t.mode),
  index('properties_manager_idx').on(t.managerId),
  check('properties_price_positive', sql`${t.price} >= 0`),
  check('properties_rating_range', sql`${t.rating} >= 0 AND ${t.rating} <= 5`),
])

export const propertyAmenities = pgTable('property_amenities', {
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  amenity: text('amenity').notNull(),
}, (t) => [primaryKey({ columns: [t.propertyId, t.amenity] })])

export const propertyNotes = pgTable('property_maintenance_notes', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  note: text('note').notNull(),
}, (t) => [uniqueIndex('property_notes_order_idx').on(t.propertyId, t.position)])

export const propertyDocuments = pgTable('property_documents', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: documentCategoryEnum('category').notNull(),
  sizeKb: integer('size_kb').notNull(),
  uploadedAt: date('uploaded_at', { mode: 'string' }).notNull(),
  uploadedBy: text('uploaded_by').notNull(),
}, (t) => [index('property_documents_property_idx').on(t.propertyId)])

/* ------------------------------ clients ---------------------------- */
export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: clientKindEnum('kind').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  nationality: text('nationality').notNull(),
  since: date('since', { mode: 'string' }).notNull(),
  status: clientStatusEnum('status').notNull(),
  notes: text('notes').notNull(),
  emergencyContact: text('emergency_contact').notNull(),
  lifetimeValue: money('lifetime_value').notNull(),
  rating: real('rating').notNull(),
}, (t) => [
  index('clients_status_idx').on(t.status),
  index('clients_kind_idx').on(t.kind),
])

/** A client's association with a property, past or present. */
export const clientProperties = pgTable('client_properties', {
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.clientId, t.propertyId] })])

export const clientDocuments = pgTable('client_documents', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: documentCategoryEnum('category').notNull(),
  sizeKb: integer('size_kb').notNull(),
  uploadedAt: date('uploaded_at', { mode: 'string' }).notNull(),
  uploadedBy: text('uploaded_by').notNull(),
}, (t) => [index('client_documents_client_idx').on(t.clientId)])

export const communications = pgTable('communications', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  channel: commChannelEnum('channel').notNull(),
  direction: commDirectionEnum('direction').notNull(),
  subject: text('subject').notNull(),
  preview: text('preview').notNull(),
  at: date('at', { mode: 'string' }).notNull(),
  author: text('author').notNull(),
}, (t) => [index('communications_client_at_idx').on(t.clientId, t.at)])

/* ----------------------------- bookings ---------------------------- */
export const bookings = pgTable('bookings', {
  id: text('id').primaryKey(),
  reference: text('reference').notNull().unique(),
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  mode: tenancyModeEnum('mode').notNull(),
  status: bookingStatusEnum('status').notNull(),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  /** Null on an open-ended rental — it runs until notice is given. */
  endsOn: date('ends_on', { mode: 'string' }),
  /** Nightly for short stays, monthly for leases and rentals. */
  rate: money('rate').notNull(),
  deposit: money('deposit').notNull(),
  /** Months of rent taken up front; the cycle repeats on a rental. */
  advanceMonths: integer('advance_months').notNull().default(0),
  /** Rent is paid through this date; null until the first cycle clears. */
  paidThrough: date('paid_through', { mode: 'string' }),
  noticeDays: integer('notice_days').notNull().default(0),
  guests: integer('guests').notNull(),
  source: bookingSourceEnum('source').notNull(),
  checkIn: time('check_in').notNull(),
  checkOut: time('check_out').notNull(),
  notes: text('notes').notNull(),
  createdAt: date('created_at', { mode: 'string' }).notNull(),
}, (t) => [
  index('bookings_property_idx').on(t.propertyId),
  index('bookings_client_idx').on(t.clientId),
  index('bookings_status_idx').on(t.status),
  index('bookings_range_idx').on(t.startsOn, t.endsOn),
  check('bookings_range_valid', sql`${t.endsOn} IS NULL OR ${t.endsOn} > ${t.startsOn}`),
  // Only an open-ended rental may omit an end date.
  check('bookings_open_ended_is_rental', sql`${t.endsOn} IS NOT NULL OR ${t.mode} = 'rental'`),
])

/* ----------------------------- invoices ---------------------------- */
export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  number: text('number').notNull().unique(),
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  bookingId: text('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  type: chargeTypeEnum('type').notNull(),
  issuedOn: date('issued_on', { mode: 'string' }).notNull(),
  dueOn: date('due_on', { mode: 'string' }).notNull(),
  amount: money('amount').notNull(),
  /**
   * The period this charge pays for. Revenue is recognised across it day by
   * day, so a quarterly advance is earned over three months and a stay that
   * crosses a month boundary lands partly in each.
   */
  earnsFrom: date('earns_from', { mode: 'string' }).notNull(),
  earnsTo: date('earns_to', { mode: 'string' }).notNull(),
  paidAmount: money('paid_amount').notNull().default(0),
  status: invoiceStatusEnum('status').notNull(),
  method: paymentMethodEnum('method'),
  paidOn: date('paid_on', { mode: 'string' }),
  memo: text('memo').notNull(),
}, (t) => [
  index('invoices_property_idx').on(t.propertyId),
  index('invoices_client_idx').on(t.clientId),
  index('invoices_status_idx').on(t.status),
  index('invoices_due_idx').on(t.dueOn),
  index('invoices_paid_on_idx').on(t.paidOn),
  index('invoices_earns_idx').on(t.earnsFrom, t.earnsTo),
  // The earning period must be a real interval, or recognition divides by zero.
  check('invoices_earns_valid', sql`${t.earnsTo} > ${t.earnsFrom}`),
  check('invoices_amount_positive', sql`${t.amount} >= 0`),
  check('invoices_paid_within_amount', sql`${t.paidAmount} >= 0 AND ${t.paidAmount} <= ${t.amount}`),
  // Nothing is settled without a date, and nothing has a date without money.
  check('invoices_paid_consistent', sql`(${t.paidOn} IS NULL) = (${t.paidAmount} = 0)`),
])

/* ---------------------------- maintenance -------------------------- */
export const maintenanceRequests = pgTable('maintenance_requests', {
  id: text('id').primaryKey(),
  reference: text('reference').notNull().unique(),
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: maintenanceCategoryEnum('category').notNull(),
  priority: maintenancePriorityEnum('priority').notNull(),
  status: maintenanceStatusEnum('status').notNull(),
  vendor: text('vendor').notNull(),
  trade: text('trade').notNull(),
  assigneeId: text('assignee_id').notNull().references(() => teamMembers.id),
  reportedBy: text('reported_by').notNull(),
  reportedOn: date('reported_on', { mode: 'string' }).notNull(),
  dueOn: date('due_on', { mode: 'string' }).notNull(),
  completedOn: date('completed_on', { mode: 'string' }),
  estimatedCost: money('estimated_cost').notNull(),
  actualCost: money('actual_cost'),
}, (t) => [
  index('maintenance_property_idx').on(t.propertyId),
  index('maintenance_status_idx').on(t.status),
  index('maintenance_due_idx').on(t.dueOn),
  // A job is completed exactly when it has a completion date.
  check('maintenance_completed_consistent',
    sql`(${t.status} = 'completed') = (${t.completedOn} IS NOT NULL)`),
])

export const maintenanceEvents = pgTable('maintenance_events', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().references(() => maintenanceRequests.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  at: date('at', { mode: 'string' }).notNull(),
  label: text('label').notNull(),
  by: text('by').notNull(),
}, (t) => [uniqueIndex('maintenance_events_order_idx').on(t.requestId, t.position)])

/* ---------------------------- occupancy ---------------------------- */
export const occupancySpells = pgTable('occupancy_spells', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  clientName: text('client_name').notNull(),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  endsOn: date('ends_on', { mode: 'string' }),
  mode: tenancyModeEnum('mode').notNull(),
  revenue: money('revenue').notNull(),
}, (t) => [index('occupancy_property_idx').on(t.propertyId)])

/* ----------------------------- settings ---------------------------- */
/** Reminder thresholds are org-wide configuration, held as a single row. */
export const reminderSettings = pgTable('reminder_settings', {
  id: integer('id').primaryKey().default(1),
  rentDueLeadDays: integer('rent_due_lead_days').notNull(),
  leaseExpiryLeadDays: integer('lease_expiry_lead_days').notNull(),
  checkInLeadHours: integer('check_in_lead_hours').notNull(),
  vacancyAlertDays: integer('vacancy_alert_days').notNull(),
  maintenanceLeadDays: integer('maintenance_lead_days').notNull(),
  channels: jsonb('channels').$type<{ inApp: boolean; email: boolean; sms: boolean; push: boolean }>().notNull(),
  quietHoursEnabled: boolean('quiet_hours_enabled').notNull(),
  quietHoursFrom: time('quiet_hours_from').notNull(),
  quietHoursTo: time('quiet_hours_to').notNull(),
  digest: text('digest').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check('reminder_settings_single_row', sql`${t.id} = 1`)])

/* ----------------------------- relations --------------------------- */
export const propertyRelations = relations(properties, ({ one, many }) => ({
  manager: one(teamMembers, { fields: [properties.managerId], references: [teamMembers.id] }),
  amenities: many(propertyAmenities),
  documents: many(propertyDocuments),
  maintenanceNotes: many(propertyNotes),
  occupancyHistory: many(occupancySpells),
  bookings: many(bookings),
  invoices: many(invoices),
  maintenance: many(maintenanceRequests),
}))

export const clientRelations = relations(clients, ({ many }) => ({
  properties: many(clientProperties),
  documents: many(clientDocuments),
  communications: many(communications),
  bookings: many(bookings),
  invoices: many(invoices),
}))

export const bookingRelations = relations(bookings, ({ one, many }) => ({
  property: one(properties, { fields: [bookings.propertyId], references: [properties.id] }),
  client: one(clients, { fields: [bookings.clientId], references: [clients.id] }),
  invoices: many(invoices),
}))

export const invoiceRelations = relations(invoices, ({ one }) => ({
  property: one(properties, { fields: [invoices.propertyId], references: [properties.id] }),
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  booking: one(bookings, { fields: [invoices.bookingId], references: [bookings.id] }),
}))

export const maintenanceRelations = relations(maintenanceRequests, ({ one, many }) => ({
  property: one(properties, { fields: [maintenanceRequests.propertyId], references: [properties.id] }),
  assignee: one(teamMembers, { fields: [maintenanceRequests.assigneeId], references: [teamMembers.id] }),
  timeline: many(maintenanceEvents),
}))
