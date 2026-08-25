import { TODAY, addDays, daysBetween, iso } from './data'
import type {
  Booking, Client, Invoice, MaintenanceRequest, Property, PropertyStatus,
} from './types'

/** An open-ended rental has no end date; for range maths treat it as running
 *  indefinitely, and render it as "open-ended" rather than as a date. */
export const OPEN_ENDED_SENTINEL = '2999-12-31'
export const endOf = (b: Booking) => b.end ?? OPEN_ENDED_SENTINEL
export const isOpenEnded = (b: Booking) => b.end === null

export interface Kpis {
  totalProperties: number
  occupiedUnits: number
  vacantUnits: number
  reservedUnits: number
  maintenanceUnits: number
  inactiveUnits: number
  occupancyRate: number
  vacancyRate: number
  monthlyRevenue: number
  monthlyRevenueDelta: number
  upcomingAmount: number
  upcomingCount: number
  overdueAmount: number
  overdueCount: number
  activeClients: number
  collectionRate: number
  openMaintenance: number
  urgentMaintenance: number
  maintenanceSpend: number
  avgNightlyRate: number
  portfolioValue: number
}

const inMonth = (d: string, offset = 0) => {
  const ref = new Date(TODAY.getFullYear(), TODAY.getMonth() + offset, 1)
  return d.slice(0, 7) === iso(ref).slice(0, 7)
}

export function computeKpis(
  properties: Property[],
  invoices: Invoice[],
  clients: Client[],
  maintenance: MaintenanceRequest[],
  bookings: Booking[],
): Kpis {
  const byStatus = (s: PropertyStatus) => properties.filter((p) => p.status === s).length
  const occupied = byStatus('occupied')
  const vacant = byStatus('available')
  const reserved = byStatus('reserved')
  const maint = byStatus('maintenance')
  const inactive = byStatus('inactive')
  const lettable = properties.length - inactive

  /* Compare like with like: this month to date against the same span of
     last month, so a mid-month figure never reads as a collapse. */
  const dayOfMonth = TODAY.getDate()
  const paidThisMonth = invoices.filter((i) => i.paidOn && inMonth(i.paidOn))
  const paidLastMonth = invoices.filter(
    (i) => i.paidOn && inMonth(i.paidOn, -1) && Number(i.paidOn.slice(8, 10)) <= dayOfMonth,
  )
  const monthlyRevenue = paidThisMonth.reduce((a, i) => a + i.paidAmount, 0)
  const lastRevenue = paidLastMonth.reduce((a, i) => a + i.paidAmount, 0)

  const today = iso(TODAY)
  const upcoming = invoices.filter(
    (i) => (i.status === 'upcoming' || i.status === 'pending') && daysBetween(today, i.dueOn) >= 0 && daysBetween(today, i.dueOn) <= 30,
  )
  const overdue = invoices.filter((i) => i.status === 'overdue' || i.status === 'partial')

  const settled = invoices.filter((i) => i.dueOn <= today && i.status !== 'upcoming')
  const billed = settled.reduce((a, i) => a + i.amount, 0)
  const collected = settled.reduce((a, i) => a + i.paidAmount, 0)

  const openMx = maintenance.filter((m) => m.status !== 'completed')
  const shortStay = properties.filter((p) => p.mode === 'short_stay' && p.status !== 'inactive')

  return {
    totalProperties: properties.length,
    occupiedUnits: occupied,
    vacantUnits: vacant,
    reservedUnits: reserved,
    maintenanceUnits: maint,
    inactiveUnits: inactive,
    occupancyRate: lettable ? ((occupied + reserved) / lettable) * 100 : 0,
    vacancyRate: lettable ? (vacant / lettable) * 100 : 0,
    monthlyRevenue,
    monthlyRevenueDelta: lastRevenue ? ((monthlyRevenue - lastRevenue) / lastRevenue) * 100 : 0,
    upcomingAmount: upcoming.reduce((a, i) => a + (i.amount - i.paidAmount), 0),
    upcomingCount: upcoming.length,
    overdueAmount: overdue.reduce((a, i) => a + (i.amount - i.paidAmount), 0),
    overdueCount: overdue.length,
    activeClients: clients.filter((c) => c.status === 'active').length,
    collectionRate: billed ? (collected / billed) * 100 : 100,
    openMaintenance: openMx.length,
    urgentMaintenance: openMx.filter((m) => m.priority === 'urgent' || m.priority === 'high').length,
    maintenanceSpend: maintenance.reduce((a, m) => a + (m.actualCost ?? 0), 0),
    avgNightlyRate: shortStay.length ? shortStay.reduce((a, p) => a + p.price, 0) / shortStay.length : 0,
    portfolioValue: properties.reduce((a, p) => a + (p.mode === 'long_term' ? p.price * 12 : p.price * 220), 0),
  }
}

/** Twelve months of collected vs billed, for the dashboard revenue chart. */
export function revenueSeries(invoices: Invoice[], months = 12) {
  const out: Array<{ key: string; label: string; collected: number; billed: number }> = []
  for (let m = months - 1; m >= 0; m--) {
    const ref = new Date(TODAY.getFullYear(), TODAY.getMonth() - m, 1)
    const key = iso(ref).slice(0, 7)
    const collected = invoices.filter((i) => i.paidOn?.slice(0, 7) === key).reduce((a, i) => a + i.paidAmount, 0)
    const billed = invoices.filter((i) => i.dueOn.slice(0, 7) === key).reduce((a, i) => a + i.amount, 0)
    out.push({ key, label: ref.toLocaleDateString('en-GB', { month: 'short' }), collected, billed })
  }
  return out
}

/** Overdue balance bucketed by how late it is — the classic AR ageing view. */
export function ageingBuckets(invoices: Invoice[]) {
  const today = iso(TODAY)
  const buckets = [
    { label: '1–15 days', lo: 1, hi: 15, amount: 0, count: 0 },
    { label: '16–30 days', lo: 16, hi: 30, amount: 0, count: 0 },
    { label: '31–60 days', lo: 31, hi: 60, amount: 0, count: 0 },
    { label: '60+ days', lo: 61, hi: 100000, amount: 0, count: 0 },
  ]
  invoices
    .filter((i) => i.status === 'overdue' || i.status === 'partial')
    .forEach((i) => {
      const late = Math.abs(daysBetween(today, i.dueOn))
      const b = buckets.find((x) => late >= x.lo && late <= x.hi)
      if (b) {
        b.amount += i.amount - i.paidAmount
        b.count += 1
      }
    })
  return buckets
}

export function occupancyMix(properties: Property[]) {
  const order: PropertyStatus[] = ['occupied', 'reserved', 'available', 'maintenance', 'inactive']
  return order.map((status) => ({
    status,
    count: properties.filter((p) => p.status === status).length,
  }))
}

/** Per-property performance for the reports table. */
export function propertyPerformance(
  properties: Property[],
  invoices: Invoice[],
  maintenance: MaintenanceRequest[],
  bookings: Booking[],
) {
  return properties.map((p) => {
    const inv = invoices.filter((i) => i.propertyId === p.id)
    const revenue = inv.reduce((a, i) => a + i.paidAmount, 0)
    const billed = inv.reduce((a, i) => a + i.amount, 0)
    const outstanding = inv.reduce((a, i) => a + (i.amount - i.paidAmount), 0)
    const costs = maintenance.filter((m) => m.propertyId === p.id).reduce((a, m) => a + (m.actualCost ?? m.estimatedCost * 0.5), 0)
    /* An open-ended rental is counted to today, not to a fabricated end. */
    const nights = bookings
      .filter((b) => b.propertyId === p.id && b.status !== 'cancelled')
      .reduce((a, b) => a + Math.max(0, daysBetween(b.start, b.end ?? iso(TODAY))), 0)
    return {
      property: p,
      revenue,
      billed,
      outstanding,
      costs,
      net: revenue - costs,
      nights,
      collection: billed ? (revenue / billed) * 100 : 100,
      utilisation: Math.min(100, (nights / 180) * 100),
    }
  })
}

/** Which properties free up inside the window — powers "becoming available". */
export function upcomingAvailability(properties: Property[], windowDays = 45) {
  const today = iso(TODAY)
  return properties
    .filter((p) => p.availableFrom && p.status !== 'inactive')
    .map((p) => ({ property: p, inDays: daysBetween(today, p.availableFrom!) }))
    .filter((x) => x.inDays >= 0 && x.inDays <= windowDays)
    .sort((a, b) => a.inDays - b.inDays)
}

/** A booking occupies a property on a given ISO day. */
export const bookingCovers = (b: Booking, day: string) => day >= b.start && day < endOf(b)

export function bookingsForRange(bookings: Booking[], from: string, to: string) {
  return bookings.filter((b) => b.status !== 'cancelled' && b.start < to && endOf(b) > from)
}

export function buildMonthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const startOffset = (first.getDay() + 6) % 7 // Monday-first
  const gridStart = addDays(first, -startOffset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = addDays(gridStart, i)
    return {
      date: iso(d),
      day: d.getDate(),
      inMonth: d.getMonth() === anchor.getMonth(),
      isToday: iso(d) === iso(TODAY),
      isWeekend: [0, 6].includes(d.getDay()),
    }
  })
}
