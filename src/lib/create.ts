/* ------------------------------------------------------------------ *
 * Record factories
 *
 * One place that turns what a form collects into a complete domain
 * record. The client calls these to apply a change instantly; the API
 * calls the same functions so what the database stores and what the
 * screen showed cannot drift apart.
 *
 * Everything a form does not ask for is derived here — identifiers,
 * reference numbers, map coordinates, opening balances — so a new
 * record is indistinguishable in shape from a seeded one.
 * ------------------------------------------------------------------ */

import { AMENITY_POOL, COMMERCIAL_AMENITIES, TODAY, addDays, iso } from './data.js'
import type {
  Booking, BookingSource, Client, ClientKind, Invoice, Property,
  PropertyStatus, PropertyType, Role, TeamMember, TenancyMode,
} from './types.js'

const addMonths = (from: string, months: number) => {
  const d = new Date(`${from}T00:00:00`)
  d.setMonth(d.getMonth() + months)
  return iso(d)
}

/** Short, sortable and collision-free without a round trip to the server. */
const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`

/** Highest numeric suffix in a set of references, so numbering continues. */
const nextNumber = (existing: string[], pattern: RegExp, floor: number) =>
  existing.reduce((max, value) => {
    const hit = pattern.exec(value)
    return hit ? Math.max(max, Number(hit[1])) : max
  }, floor) + 1

/* ---------------------------- properties --------------------------- */

export interface PropertyDraft {
  name: string
  type: PropertyType
  mode: TenancyMode
  status: PropertyStatus
  line1: string
  district: string
  city: string
  country: string
  bedrooms: number
  bathrooms: number
  sizeSqm: number
  price: number
  managerId: string
  amenities: string[]
  availableFrom: string | null
  notes: string
}

export const AMENITY_CHOICES = (type: PropertyType) =>
  type === 'commercial' ? COMMERCIAL_AMENITIES : AMENITY_POOL

export const emptyPropertyDraft = (managerId: string): PropertyDraft => ({
  name: '',
  type: 'apartment',
  mode: 'long_term',
  status: 'available',
  line1: '',
  district: '',
  city: 'Kampala',
  country: 'Uganda',
  bedrooms: 2,
  bathrooms: 2,
  sizeSqm: 110,
  price: 0,
  managerId,
  amenities: [],
  availableFrom: iso(TODAY),
  notes: '',
})

export const propertyDraftFrom = (p: Property): PropertyDraft => ({
  name: p.name,
  type: p.type,
  mode: p.mode,
  status: p.status,
  line1: p.address.line1,
  district: p.address.district,
  city: p.address.city,
  country: p.address.country,
  bedrooms: p.bedrooms,
  bathrooms: p.bathrooms,
  sizeSqm: p.sizeSqm,
  price: p.price,
  managerId: p.managerId,
  amenities: p.amenities,
  availableFrom: p.availableFrom,
  notes: p.notes,
})

/* The schematic map plots normalised coordinates rather than real ones.
   Deriving them from the district name keeps every unit in a district
   clustered together, which is what the map is actually communicating. */
const coordsFor = (district: string) => {
  let h = 0
  for (const ch of district.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return { x: 0.12 + ((h % 1000) / 1000) * 0.76, y: 0.12 + (((h >> 10) % 1000) / 1000) * 0.76 }
}

const addressOf = (draft: PropertyDraft) => ({
  line1: draft.line1.trim() || 'Address to be confirmed',
  district: draft.district.trim() || draft.city.trim(),
  city: draft.city.trim() || 'Kampala',
  country: draft.country.trim() || 'Uganda',
  ...coordsFor(draft.district.trim() || draft.city.trim()),
})

export function newProperty(draft: PropertyDraft, existing: Property[]): Property {
  const n = nextNumber(existing.map((p) => p.code), /^ALT-(\d+)$/, 0)
  return {
    id: uid('p'),
    code: `ALT-${String(n).padStart(3, '0')}`,
    name: draft.name.trim(),
    type: draft.type,
    mode: draft.mode,
    status: draft.status,
    address: addressOf(draft),
    bedrooms: Math.max(0, Math.round(draft.bedrooms)),
    bathrooms: Math.max(0, Math.round(draft.bathrooms)),
    sizeSqm: Math.max(0, Math.round(draft.sizeSqm)),
    amenities: [...new Set(draft.amenities)],
    price: Math.max(0, Math.round(draft.price)),
    currency: 'UGX',
    managerId: draft.managerId,
    // An unlet unit has no track record yet; it earns its rating in use.
    rating: 0,
    availableFrom: draft.status === 'available' ? draft.availableFrom : null,
    acquiredOn: iso(TODAY),
    yieldPct: 0,
    notes: draft.notes.trim(),
    photoSeed: Math.floor(Math.random() * 10_000),
    documents: [],
    occupancyHistory: [],
    maintenanceNotes: [],
  }
}

/** Applies an edit without disturbing anything the form does not own. */
export function editProperty(existing: Property, draft: PropertyDraft): Property {
  return {
    ...existing,
    name: draft.name.trim(),
    type: draft.type,
    mode: draft.mode,
    status: draft.status,
    address: { ...addressOf(draft) },
    bedrooms: Math.max(0, Math.round(draft.bedrooms)),
    bathrooms: Math.max(0, Math.round(draft.bathrooms)),
    sizeSqm: Math.max(0, Math.round(draft.sizeSqm)),
    amenities: [...new Set(draft.amenities)],
    price: Math.max(0, Math.round(draft.price)),
    managerId: draft.managerId,
    availableFrom: draft.status === 'available' ? draft.availableFrom : null,
    notes: draft.notes.trim(),
  }
}

/* ----------------------------- clients ----------------------------- */

export interface ClientDraft {
  name: string
  kind: ClientKind
  email: string
  phone: string
  nationality: string
  status: Client['status']
  emergencyContact: string
  notes: string
  propertyIds: string[]
}

export const emptyClientDraft = (): ClientDraft => ({
  name: '',
  kind: 'tenant',
  email: '',
  phone: '',
  nationality: 'Ugandan',
  status: 'prospect',
  emergencyContact: '',
  notes: '',
  propertyIds: [],
})

export function newClient(draft: ClientDraft): Client {
  return {
    id: uid('c'),
    name: draft.name.trim(),
    kind: draft.kind,
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    nationality: draft.nationality.trim() || 'Ugandan',
    since: iso(TODAY),
    status: draft.status,
    propertyIds: [...new Set(draft.propertyIds)],
    idDocuments: [],
    notes: draft.notes.trim(),
    emergencyContact: draft.emergencyContact.trim(),
    communications: [{
      id: uid('cm'),
      channel: 'note',
      direction: 'outbound',
      subject: 'Client added',
      preview: `${draft.name.trim()} added to the portfolio.`,
      at: iso(TODAY),
      author: 'You',
    }],
    lifetimeValue: 0,
    rating: 0,
  }
}

/* ---------------------------- agreements --------------------------- */

export interface BookingDraft {
  propertyId: string
  clientId: string
  mode: TenancyMode
  start: string
  /** Ignored on a rental, which is open-ended by definition. */
  end: string
  rate: number
  deposit: number
  advanceMonths: number
  noticeDays: number
  guests: number
  source: BookingSource
  notes: string
}

export const emptyBookingDraft = (propertyId: string, clientId: string): BookingDraft => ({
  propertyId,
  clientId,
  mode: 'long_term',
  start: iso(TODAY),
  end: addMonths(iso(TODAY), 12),
  rate: 0,
  deposit: 0,
  /* A rental is open-ended, so the advance is what protects the owner from a
     tenant leaving after a month. Three is the floor the business works to. */
  advanceMonths: 3,
  noticeDays: 60,
  guests: 2,
  source: 'direct',
  notes: '',
})

/** Months of rent an agreement of this shape takes up front. */
export const advanceFloor = (mode: TenancyMode) => (mode === 'rental' ? 3 : 0)

export function newBooking(draft: BookingDraft, existing: Booking[]): Booking {
  const n = nextNumber(existing.map((b) => b.reference), /^ALT-(\d+)$/, 4000)
  const rental = draft.mode === 'rental'
  const advanceMonths = rental
    ? Math.max(advanceFloor('rental'), Math.round(draft.advanceMonths))
    : Math.max(0, Math.round(draft.advanceMonths))

  return {
    id: uid('b'),
    reference: `ALT-${n}`,
    propertyId: draft.propertyId,
    clientId: draft.clientId,
    mode: draft.mode,
    // Anything starting later than today is committed but not yet running.
    status: draft.start > iso(TODAY) ? 'upcoming' : 'in_progress',
    start: draft.start,
    end: rental ? null : draft.end,
    rate: Math.max(0, Math.round(draft.rate)),
    deposit: Math.max(0, Math.round(draft.deposit)),
    advanceMonths,
    // Nothing is settled until the opening charges are actually paid.
    paidThrough: null,
    noticeDays: Math.max(0, Math.round(draft.noticeDays)),
    guests: Math.max(1, Math.round(draft.guests)),
    source: draft.source,
    checkIn: draft.mode === 'short_stay' ? '15:00' : '12:00',
    checkOut: draft.mode === 'short_stay' ? '11:00' : '12:00',
    notes: draft.notes.trim(),
    createdAt: iso(TODAY),
  }
}

/**
 * The charges an agreement raises on day one: the refundable deposit, and
 * either the advance that opens a rental or the first period's rent. Both
 * are issued unpaid — recording the payment is a separate, deliberate act.
 */
export function openingCharges(booking: Booking, existing: Invoice[]): Invoice[] {
  const n = nextNumber(existing.map((i) => i.number), /^ALT-INV-(\d+)$/, 5000)
  const out: Invoice[] = []
  const issuedOn = iso(TODAY)
  const dueOn = booking.start > issuedOn ? booking.start : issuedOn

  if (booking.deposit > 0) {
    out.push({
      id: uid('i'),
      number: `ALT-INV-${n}`,
      propertyId: booking.propertyId,
      clientId: booking.clientId,
      bookingId: booking.id,
      type: 'deposit',
      issuedOn,
      dueOn,
      amount: booking.deposit,
      /* A deposit is never revenue, so its window is nominal — it exists only
         because every charge carries one. chargeClass keeps it out of income. */
      earnsFrom: dueOn,
      earnsTo: addMonths(dueOn, 1),
      paidAmount: 0,
      status: dueOn < issuedOn ? 'overdue' : 'pending',
      method: null,
      paidOn: null,
      memo: 'Refundable security deposit — held in client account',
    })
  }

  const months = booking.mode === 'rental' ? Math.max(1, booking.advanceMonths) : 1
  const nights = booking.mode === 'short_stay' && booking.end
    ? Math.max(1, Math.round((Date.parse(booking.end) - Date.parse(booking.start)) / 86_400_000))
    : 0

  if (booking.rate > 0) {
    const earnsFrom = booking.start
    const earnsTo = booking.mode === 'short_stay'
      ? iso(addDays(booking.start, Math.max(1, nights)))
      : addMonths(booking.start, months)

    out.push({
      id: uid('i'),
      number: `ALT-INV-${n + out.length}`,
      propertyId: booking.propertyId,
      clientId: booking.clientId,
      bookingId: booking.id,
      type: booking.mode === 'rental' ? 'advance' : booking.mode === 'short_stay' ? 'booking' : 'rent',
      issuedOn,
      dueOn,
      amount: booking.mode === 'short_stay' ? booking.rate * Math.max(1, nights) : booking.rate * months,
      earnsFrom,
      earnsTo,
      paidAmount: 0,
      status: dueOn < issuedOn ? 'overdue' : 'pending',
      method: null,
      paidOn: null,
      memo: booking.mode === 'rental'
        ? `${months}-month advance — ${booking.reference}`
        : booking.mode === 'short_stay'
          ? `${Math.max(1, nights)}-night stay — ${booking.reference}`
          : `First month's rent — ${booking.reference}`,
    })
  }

  return out
}

/** The status a property takes once an agreement is committed against it. */
export const statusForBooking = (booking: Booking): PropertyStatus =>
  booking.status === 'upcoming' ? 'reserved' : 'occupied'

/* ------------------------------ editing ---------------------------- *
 * Editing mirrors creation: a draft the form owns, and a function that
 * folds it back onto the record without touching anything the form does
 * not show. History, documents and identifiers survive an edit.
 * ------------------------------------------------------------------- */

export const clientDraftFrom = (c: Client): ClientDraft => ({
  name: c.name,
  kind: c.kind,
  email: c.email,
  phone: c.phone,
  nationality: c.nationality,
  status: c.status,
  emergencyContact: c.emergencyContact,
  notes: c.notes,
  propertyIds: c.propertyIds,
})

export function editClient(existing: Client, draft: ClientDraft): Client {
  return {
    ...existing,
    name: draft.name.trim(),
    kind: draft.kind,
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    nationality: draft.nationality.trim() || 'Ugandan',
    status: draft.status,
    propertyIds: [...new Set(draft.propertyIds)],
    notes: draft.notes.trim(),
    emergencyContact: draft.emergencyContact.trim(),
  }
}

export const bookingDraftFrom = (b: Booking): BookingDraft => ({
  propertyId: b.propertyId,
  clientId: b.clientId,
  mode: b.mode,
  start: b.start,
  end: b.end ?? '',
  rate: b.rate,
  deposit: b.deposit,
  advanceMonths: b.advanceMonths,
  noticeDays: b.noticeDays,
  guests: b.guests,
  source: b.source,
  notes: b.notes,
})

/**
 * An edit cannot change which unit or which client an agreement is for,
 * nor its kind — those decide what charges were already raised against
 * it. Ending it early is a separate act, not an edit.
 */
export function editBooking(existing: Booking, draft: BookingDraft): Booking {
  return {
    ...existing,
    start: draft.start,
    end: existing.mode === 'rental' ? null : draft.end,
    rate: Math.max(0, Math.round(draft.rate)),
    deposit: Math.max(0, Math.round(draft.deposit)),
    advanceMonths: Math.max(advanceFloor(existing.mode), Math.round(draft.advanceMonths)),
    noticeDays: Math.max(0, Math.round(draft.noticeDays)),
    guests: Math.max(1, Math.round(draft.guests)),
    source: draft.source,
    notes: draft.notes.trim(),
  }
}

/**
 * Closing an agreement: the tenancy ends, so the unit comes free.
 *
 * An agreement closed on or before the day it began never ran, so it is
 * cancelled rather than completed and keeps its dates — an end date on or
 * before the start is not a period, and the schema rightly refuses one.
 */
export function endBooking(existing: Booking, on: string): Booking {
  const ranAtAll = on > existing.start
  return {
    ...existing,
    status: ranAtAll ? 'completed' : 'cancelled',
    end: ranAtAll ? on : existing.end,
  }
}

/* ------------------------------- team ------------------------------ */

export interface MemberDraft {
  name: string
  role: Role
  title: string
  email: string
  phone: string
}

export const emptyMemberDraft = (): MemberDraft => ({
  name: '',
  role: 'staff',
  title: '',
  email: '',
  phone: '',
})

export const memberDraftFrom = (m: TeamMember): MemberDraft => ({
  name: m.name,
  role: m.role,
  title: m.title,
  email: m.email,
  phone: m.phone,
})

export function newMember(draft: MemberDraft): TeamMember {
  return {
    id: uid('om'),
    name: draft.name.trim(),
    role: draft.role,
    title: draft.title.trim() || roleTitle(draft.role),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    since: iso(TODAY),
  }
}

export function editMember(existing: TeamMember, draft: MemberDraft): TeamMember {
  return {
    ...existing,
    name: draft.name.trim(),
    role: draft.role,
    title: draft.title.trim() || roleTitle(draft.role),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
  }
}

/** A sensible job title when someone does not supply one. */
const roleTitle = (role: Role): string => ({
  owner: 'Principal',
  manager: 'Property Manager',
  staff: 'Portfolio Assistant',
  accountant: 'Accountant',
  tenant: 'Tenant portal',
}[role])
