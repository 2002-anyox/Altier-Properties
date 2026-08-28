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
/* 'tenant' is a portal role, not a staff seat: it reads one person's own
   lease, charges and documents and nothing else. Kept in the same enum so
   there is a single membership table and therefore a single place where
   access is decided. */
export const roleEnum = pgEnum('role', ['owner', 'manager', 'accountant', 'staff', 'tenant'])
export const planEnum = pgEnum('plan', ['starter', 'professional', 'enterprise'])
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing', 'active', 'past_due', 'cancelled',
])
export const membershipStatusEnum = pgEnum('membership_status', ['invited', 'active', 'suspended'])
export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending', 'accepted', 'revoked', 'expired',
])
export const authProviderEnum = pgEnum('auth_provider', ['google', 'apple'])
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

/* --------------------------- the workspace ------------------------- *
 * An organization is one paying customer: a landlord, an agency, a
 * management company. Everything a customer owns hangs off it, and every
 * business table below carries its id — not as a convention, but because
 * the row-level policies in the migration read that column and nothing
 * else. Isolation is a property of the database here, not of remembering
 * to write a WHERE clause.
 * ------------------------------------------------------------------- */

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /* Stable and human-readable, for URLs and for support to quote back. */
  slug: text('slug').notNull().unique(),
  country: text('country').notNull().default('Uganda'),
  currency: text('currency').notNull().default('UGX'),
  locale: text('locale').notNull().default('en-UG'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * What the workspace is entitled to.
 *
 * One row per organization. `seatLimit` is null for unlimited rather than
 * a large number, so "enterprise" cannot be silently capped by a constant
 * somebody forgot about.
 */
export const subscriptions = pgTable('subscriptions', {
  organizationId: text('organization_id').primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  plan: planEnum('plan').notNull().default('starter'),
  status: subscriptionStatusEnum('status').notNull().default('trialing'),
  seatLimit: integer('seat_limit'),
  /* Whether a tenant portal login consumes a paid seat. Off by default:
     a landlord with 200 tenants is not buying 200 seats. */
  tenantsCountAsSeats: boolean('tenants_count_as_seats').notNull().default(false),
  currentPeriodStart: date('current_period_start', { mode: 'string' }),
  currentPeriodEnd: date('current_period_end', { mode: 'string' }),
  trialEndsAt: date('trial_ends_at', { mode: 'string' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ------------------------------- team ------------------------------ */
/**
 * A login identity, and nothing about any workspace.
 *
 * Split out from the old team_members because one person can work for
 * more than one organization — an agency managing two landlords' books
 * is the ordinary case — and because a role is a fact about a membership,
 * not about a person. The email is unique across the platform: it is what
 * an invitation and a linked Google account are matched against.
 */
export const profiles = pgTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull().default(''),

  /* Credentials. Null until an account is given a password — somebody can
     be invited and exist before they can sign in. */
  passwordHash: text('password_hash'),
  passwordSetAt: timestamp('password_set_at', { withTimezone: true }),
  /* Throttling lives on the row rather than in memory, because a serverless
     instance forgets between requests and an attacker would not. */
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),

  /* Altier's own support staff. Never granted by anything a customer can
     reach, and the only thing that reads across organizations. */
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('profiles_email_idx').on(t.email),
])

/**
 * A person's place in one workspace: which organization, what role.
 *
 * This table is the authority the row-level policies consult. A session
 * says who is asking and which workspace they claim; a policy only agrees
 * if a row here says that pairing is real and active. So the API cannot
 * widen its own access by setting a variable wrongly — the worst it can
 * do is name a membership that does not exist, and see nothing.
 */
export const organizationMembers = pgTable('organization_members', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  profileId: text('profile_id').notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull(),
  title: text('title').notNull().default(''),
  status: membershipStatusEnum('status').notNull().default('active'),
  since: date('since', { mode: 'string' }).notNull(),

  /* Set only when role is 'tenant': which client's records this login may
     see. A tenant membership without one can reach nothing, which is the
     safe way round. */
  clientId: text('client_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('organization_members_unique').on(t.organizationId, t.profileId),
  index('organization_members_profile_idx').on(t.profileId),
  index('organization_members_org_idx').on(t.organizationId),
  /* A tenant membership names the client it speaks for; a staff one never
     does. Enforced here so no code path can produce the other shapes. */
  check('organization_members_tenant_link',
    sql`(role = 'tenant') = (client_id IS NOT NULL)`),
])

/**
 * Properties a manager or staff member may touch.
 *
 * Absent for an owner or accountant, who see the whole workspace. Present
 * and empty for a manager means exactly that: nothing assigned yet.
 */
export const memberProperties = pgTable('member_properties', {
  memberId: text('member_id').notNull()
    .references(() => organizationMembers.id, { onDelete: 'cascade' }),
  propertyId: text('property_id').notNull(),
}, (t) => [
  primaryKey({ columns: [t.memberId, t.propertyId] }),
  index('member_properties_property_idx').on(t.propertyId),
])

/**
 * An invitation to join a workspace.
 *
 * Holds only the SHA-256 of the token, like a session does, so a copy of
 * this table cannot be used to join anything. Seat accounting counts
 * pending invitations: an owner who invites three people has spent three
 * seats before any of them accepts, which is what stops a Starter
 * workspace inviting thirty and sorting it out later.
 */
export const invitations = pgTable('invitations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: roleEnum('role').notNull(),
  title: text('title').notNull().default(''),
  tokenHash: text('token_hash').notNull().unique(),
  status: invitationStatusEnum('status').notNull().default('pending'),
  invitedBy: text('invited_by').references(() => profiles.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('invitations_org_idx').on(t.organizationId),
  index('invitations_email_idx').on(t.email),
])

/** Properties an invited manager or staff member will be assigned. */
export const invitationProperties = pgTable('invitation_properties', {
  invitationId: text('invitation_id').notNull()
    .references(() => invitations.id, { onDelete: 'cascade' }),
  propertyId: text('property_id').notNull(),
}, (t) => [primaryKey({ columns: [t.invitationId, t.propertyId] })])

/**
 * Sessions.
 *
 * The row holds the SHA-256 of the token, never the token itself, so a
 * copy of this table cannot be used to sign in as anybody. Deleting a
 * team member cascades here, which is what makes removing someone an
 * immediate revocation rather than a note for later.
 */
export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  /* Which workspace this session is looking at. Someone in two
     organizations has one session and switches between them; every policy
     reads this, so switching is the only way to see the other's records. */
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
}, (t) => [
  index('sessions_profile_idx').on(t.profileId),
  index('sessions_expiry_idx').on(t.expiresAt),
])

/**
 * Linked sign-in accounts.
 *
 * A Google or Apple account is a *way in* to a team member, never a team
 * member itself: the subject is matched against a row that an owner
 * already created. Nothing here can bring a new person into the
 * portfolio, which is the property that makes public identity providers
 * safe to accept at all.
 *
 * Keyed on (provider, subject) because that pair is what the provider
 * promises is stable — an email address is not: people change theirs, and
 * Apple hands out a different one per app if asked.
 */
export const identities = pgTable('identities', {
  provider: authProviderEnum('provider').notNull(),
  subject: text('subject').notNull(),
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  /* Kept for display only — which address was used, so an owner can see
     why a link exists. Never read back as a credential. */
  email: text('email'),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.provider, t.subject] }),
  index('identities_profile_idx').on(t.profileId),
])

/**
 * In-flight sign-in attempts.
 *
 * The `state` parameter has to survive a round trip through a provider we
 * do not control, so it cannot live in memory: a serverless instance that
 * starts the flow is rarely the one that finishes it. Rows are single-use
 * and short-lived, and the PKCE verifier never leaves this table.
 */
export const oauthStates = pgTable('oauth_states', {
  /* The SHA-256 of the state parameter, not the parameter. A leaked copy
     of this table cannot be replayed into a sign-in. */
  stateHash: text('state_hash').primaryKey(),
  provider: authProviderEnum('provider').notNull(),
  /* PKCE. Null for a provider that does not take one. */
  verifier: text('verifier'),
  nonce: text('nonce').notNull(),
  /* Ties the callback to the browser that began the flow, so a state
     handed to somebody else cannot sign them in as the attacker. */
  browserHash: text('browser_hash').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => [
  index('oauth_states_expiry_idx').on(t.expiresAt),
])

/* ---------------------------- properties --------------------------- */
export const properties = pgTable('properties', {
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
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
  managerId: text('manager_id').notNull().references(() => organizationMembers.id),
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
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  amenity: text('amenity').notNull(),
}, (t) => [primaryKey({ columns: [t.propertyId, t.amenity] })])

export const propertyNotes = pgTable('property_maintenance_notes', {
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  note: text('note').notNull(),
}, (t) => [uniqueIndex('property_notes_order_idx').on(t.propertyId, t.position)])

export const propertyDocuments = pgTable('property_documents', {
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
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
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
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
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.clientId, t.propertyId] })])

export const clientDocuments = pgTable('client_documents', {
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: documentCategoryEnum('category').notNull(),
  sizeKb: integer('size_kb').notNull(),
  uploadedAt: date('uploaded_at', { mode: 'string' }).notNull(),
  uploadedBy: text('uploaded_by').notNull(),
}, (t) => [index('client_documents_client_idx').on(t.clientId)])

export const communications = pgTable('communications', {
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
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
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
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
  /* The times of day arrival and departure are expected, agreed when the
     agreement is drawn up. Not a record of anything having happened. */
  checkIn: time('check_in').notNull(),
  checkOut: time('check_out').notNull(),

  /* When they actually arrived and actually left. Null until each
     happens, which is the difference between an expectation and a fact —
     a guest can arrive a day late or leave a week early, and the ledger
     should say which. */
  arrivedOn: date('arrived_on', { mode: 'string' }),
  departedOn: date('departed_on', { mode: 'string' }),

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
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
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
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
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
  assigneeId: text('assignee_id').notNull().references(() => organizationMembers.id),
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
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().references(() => maintenanceRequests.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  at: date('at', { mode: 'string' }).notNull(),
  label: text('label').notNull(),
  by: text('by').notNull(),
}, (t) => [uniqueIndex('maintenance_events_order_idx').on(t.requestId, t.position)])

/* ---------------------------- occupancy ---------------------------- */
export const occupancySpells = pgTable('occupancy_spells', {
  /* Every policy in the migration reads this column and nothing else. */
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  clientName: text('client_name').notNull(),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  endsOn: date('ends_on', { mode: 'string' }),
  mode: tenancyModeEnum('mode').notNull(),
  revenue: money('revenue').notNull(),
}, (t) => [index('occupancy_property_idx').on(t.propertyId)])

/**
 * What each role reaches in one workspace.
 *
 * A row is a deliberate departure from the built-in default in
 * src/lib/rbac.ts, never a copy of it. No rows means the defaults stand,
 * which is what a new workspace has and what most will keep — so this
 * table is empty until somebody changes something, and there is exactly
 * one place a default is written down.
 */
export const rolePermissions = pgTable('role_permissions', {
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull(),
  permission: text('permission').notNull(),
  allowed: boolean('allowed').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.organizationId, t.role, t.permission] }),
])

/* ----------------------------- settings ---------------------------- */
/** Reminder thresholds are org-wide configuration, held as a single row. */
/**
 * Which alerts a person has read.
 *
 * The alerts themselves are still derived from the records that cause
 * them — a stored copy goes stale the moment a charge is paid, and then
 * the notification centre is arguing with the ledger. What cannot be
 * derived is whether somebody has looked at one, so that is what is
 * stored, keyed on the alert's stable identifier.
 */
export const notificationReads = pgTable('notification_reads', {
  organizationId: text('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  memberId: text('member_id').notNull()
    .references(() => organizationMembers.id, { onDelete: 'cascade' }),
  notificationId: text('notification_id').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.memberId, t.notificationId] }),
  index('notification_reads_org_idx').on(t.organizationId),
])

export const reminderSettings = pgTable('reminder_settings', {
  /* One row per workspace rather than one row full stop: reminder timing
     is a customer's preference, not the platform's. */
  organizationId: text('organization_id').primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
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
})

/* ----------------------------- relations --------------------------- */
export const propertyRelations = relations(properties, ({ one, many }) => ({
  manager: one(organizationMembers, { fields: [properties.managerId], references: [organizationMembers.id] }),
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
  assignee: one(organizationMembers, { fields: [maintenanceRequests.assigneeId], references: [organizationMembers.id] }),
  timeline: many(maintenanceEvents),
}))
