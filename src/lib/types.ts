/* ============================================================
   Altier Properties — domain model
   ============================================================ */

/**
 * Five roles, one list. The first four are staff — people who work on the
 * portfolio and occupy a paid seat. 'tenant' is a portal login for a
 * renter or guest: it reads that one person's own agreement, charges and
 * documents, and it is not a seat. Keeping it in the same list means
 * there is one membership table, and therefore one place where access is
 * decided rather than two that can disagree.
 */
export type Role = 'owner' | 'manager' | 'staff' | 'accountant' | 'tenant'

/** The four that count against a subscription's seats. */
export const STAFF_ROLES = ['owner', 'manager', 'accountant', 'staff'] as const
export type StaffRole = typeof STAFF_ROLES[number]

export type PropertyStatus =
  | 'available'
  | 'occupied'
  | 'reserved'
  | 'maintenance'
  | 'inactive'

export type PropertyType =
  | 'apartment'
  | 'house'
  | 'villa'
  | 'serviced'
  | 'short_stay'
  | 'commercial'

/**
 * How a property earns.
 *  - `long_term`  fixed-term lease: a start, an end, a renewal decision
 *  - `rental`     open-ended rental: rolling monthly until the tenant gives
 *                 notice, with several months paid up front so a tenant
 *                 cannot leave after one or two and strand the owner
 *  - `short_stay` nightly, Airbnb-style
 */
export type TenancyMode = 'long_term' | 'rental' | 'short_stay'

export interface Address {
  line1: string
  district: string
  city: string
  country: string
  /** Normalised 0–1 coords used by the schematic portfolio map. */
  x: number
  y: number
}

export interface OccupancySpell {
  id: string
  clientName: string
  from: string
  to: string | null
  mode: TenancyMode
  revenue: number
}

export interface PropertyDocument {
  id: string
  name: string
  category: 'lease' | 'title' | 'insurance' | 'inspection' | 'compliance' | 'invoice' | 'id'
  sizeKb: number
  uploadedAt: string
  uploadedBy: string
}

export interface Property {
  id: string
  code: string
  name: string
  type: PropertyType
  mode: TenancyMode
  status: PropertyStatus
  address: Address
  bedrooms: number
  bathrooms: number
  sizeSqm: number
  amenities: string[]
  /** Monthly rent for long lets; nightly rate for short stays. */
  price: number
  currency: string
  managerId: string
  rating: number
  /** ISO date the unit frees up — drives "becoming available" views. */
  availableFrom: string | null
  acquiredOn: string
  yieldPct: number
  notes: string
  photoSeed: number
  documents: PropertyDocument[]
  occupancyHistory: OccupancySpell[]
  maintenanceNotes: string[]
}

export type ClientKind = 'tenant' | 'guest' | 'corporate' | 'owner'

export interface CommunicationEntry {
  id: string
  channel: 'email' | 'call' | 'sms' | 'note' | 'portal'
  direction: 'inbound' | 'outbound'
  subject: string
  preview: string
  at: string
  author: string
}

export interface Client {
  id: string
  name: string
  kind: ClientKind
  email: string
  phone: string
  nationality: string
  since: string
  status: 'active' | 'past' | 'prospect'
  propertyIds: string[]
  idDocuments: PropertyDocument[]
  notes: string
  emergencyContact: string
  communications: CommunicationEntry[]
  lifetimeValue: number
  rating: number
}

export type BookingStatus =
  | 'upcoming'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'pending'

export type BookingSource = 'direct' | 'airbnb' | 'booking_com' | 'agency' | 'corporate'

export interface Booking {
  id: string
  reference: string
  propertyId: string
  clientId: string
  mode: TenancyMode
  status: BookingStatus
  start: string
  /** `null` on an open-ended rental — it runs until notice is given. */
  end: string | null
  /** Nightly for short stays, monthly for leases and rentals. */
  rate: number
  deposit: number
  /** Months of rent taken up front. Open-ended rentals require several. */
  advanceMonths: number
  /** Rent is paid through to this date; the advance tops it up. */
  paidThrough: string | null
  /** Notice the tenant must give before leaving. */
  noticeDays: number
  guests: number
  source: BookingSource
  checkIn: string
  checkOut: string
  notes: string
  createdAt: string
}

export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'upcoming' | 'partial'

export type ChargeType =
  | 'rent'
  | 'advance'
  | 'booking'
  | 'deposit'
  | 'utilities'
  | 'service_fee'
  | 'late_fee'
  | 'maintenance_recharge'

export interface Invoice {
  id: string
  number: string
  propertyId: string
  clientId: string
  bookingId: string | null
  type: ChargeType
  issuedOn: string
  dueOn: string
  amount: number
  /**
   * The period this charge pays for — inclusive start, exclusive end.
   * Revenue is recognised across it day by day, so a quarterly advance is
   * earned over its three months and a stay that runs across a month
   * boundary lands partly in each. Deposits carry a period but are never
   * recognised; they are the tenant's money.
   */
  earnsFrom: string
  earnsTo: string
  paidAmount: number
  status: InvoiceStatus
  method: 'bank_transfer' | 'card' | 'mobile_money' | 'cash' | null
  paidOn: string | null
  memo: string
}

export type MaintenancePriority = 'urgent' | 'high' | 'medium' | 'low'
export type MaintenanceStatus =
  | 'reported'
  | 'scheduled'
  | 'in_progress'
  | 'awaiting_parts'
  | 'completed'

export interface MaintenanceEvent {
  at: string
  label: string
  by: string
}

export interface MaintenanceRequest {
  id: string
  reference: string
  propertyId: string
  title: string
  description: string
  category: 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'cleaning' | 'safety' | 'grounds'
  priority: MaintenancePriority
  status: MaintenanceStatus
  vendor: string
  trade: string
  assigneeId: string
  reportedBy: string
  reportedOn: string
  dueOn: string
  completedOn: string | null
  estimatedCost: number
  actualCost: number | null
  timeline: MaintenanceEvent[]
}

export type NotificationKind =
  | 'payment_due'
  | 'payment_overdue'
  | 'lease_expiry'
  | 'check_in'
  | 'check_out'
  | 'vacancy'
  | 'maintenance'
  | 'document'
  | 'system'

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low'

export interface AppNotification {
  id: string
  kind: NotificationKind
  priority: NotificationPriority
  title: string
  body: string
  createdAt: string
  read: boolean
  entity: { type: 'property' | 'client' | 'invoice' | 'booking' | 'maintenance'; id: string } | null
  actionLabel: string | null
}

export interface TeamMember {
  id: string
  name: string
  role: Role
  title: string
  email: string
  phone: string
  since: string
  /**
   * Which properties this person works on.
   *
   * Only meaningful for a manager or staff member: an owner and an
   * accountant see the whole workspace, so an empty list means "all" for
   * them and "nothing yet" for the other two. The database reads the same
   * assignments to decide what their queries return, so this is the list,
   * not a copy of it.
   */
  propertyIds?: string[]
}

export interface ReminderSettings {
  rentDueLeadDays: number
  leaseExpiryLeadDays: number
  checkInLeadHours: number
  vacancyAlertDays: number
  maintenanceLeadDays: number
  channels: { inApp: boolean; email: boolean; sms: boolean; push: boolean }
  quietHours: { enabled: boolean; from: string; to: string }
  digest: 'off' | 'daily' | 'weekly'
}

/**
 * The bootstrap payload: everything the app needs in one response.
 *
 * At this portfolio's size the whole dataset is kilobytes, so the client
 * holds it and every selector in derive.ts keeps working over plain arrays.
 * Notifications are absent because they are derived, not stored.
 */
export interface Portfolio {
  properties: Property[]
  clients: Client[]
  bookings: Booking[]
  invoices: Invoice[]
  maintenance: MaintenanceRequest[]
  team: TeamMember[]
  reminders: ReminderSettings
}
