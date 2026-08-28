/* ------------------------------------------------------------------ *
 * Notifications
 *
 * Derived, never stored. Every alert here is read off a record that
 * exists — a charge past its due date, a lease running out, an arrival
 * tomorrow — against the lead times in the workspace's reminder
 * settings. So an empty portfolio produces an empty list, and nothing
 * has to be cleaned up when a record changes.
 * ------------------------------------------------------------------ */

import { presentation } from './money.js'
import { TODAY, dayOffset, daysBetween, iso } from './dates.js'
import type {
  AppNotification, Booking, Client, Invoice, MaintenanceRequest, Property, ReminderSettings,
} from './types.js'

export function buildNotifications(
  properties: Property[],
  invoices: Invoice[],
  bookings: Booking[],
  maintenance: MaintenanceRequest[],
  clients: Client[],
  reminders: ReminderSettings,
): AppNotification[] {
  const today = iso(TODAY)
  const out: AppNotification[] = []
  const nameOf = (id: string) => properties.find((p) => p.id === id)?.name ?? 'Property'
  const clientOf = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Client'

  invoices.forEach((inv) => {
    const gap = daysBetween(today, inv.dueOn)
    if (inv.status === 'overdue') {
      out.push({
        id: `n-inv-${inv.id}`, kind: 'payment_overdue', priority: Math.abs(gap) > 14 ? 'critical' : 'high',
        title: `Payment overdue · ${formatMoney(inv.amount - inv.paidAmount)}`,
        body: `${clientOf(inv.clientId)} — ${nameOf(inv.propertyId)}. ${Math.abs(gap)} days past due on ${inv.number}.`,
        createdAt: inv.dueOn, read: false, entity: { type: 'invoice', id: inv.id }, actionLabel: 'Chase payment',
      })
    } else if ((inv.status === 'pending' || inv.status === 'upcoming') && gap >= 0 && gap <= reminders.rentDueLeadDays) {
      out.push({
        id: `n-inv-${inv.id}`, kind: 'payment_due', priority: gap <= 1 ? 'high' : 'normal',
        title: `${inv.type === 'rent' ? 'Rent' : 'Payment'} due ${gap === 0 ? 'today' : `in ${gap} day${gap > 1 ? 's' : ''}`}`,
        body: `${formatMoney(inv.amount)} from ${clientOf(inv.clientId)} for ${nameOf(inv.propertyId)}.`,
        createdAt: dayOffset(-Math.max(0, reminders.rentDueLeadDays - gap)), read: false,
        entity: { type: 'invoice', id: inv.id }, actionLabel: 'Send reminder',
      })
    } else if (inv.status === 'partial') {
      out.push({
        id: `n-inv-${inv.id}`, kind: 'payment_due', priority: 'normal',
        title: `Part payment received · ${formatMoney(inv.paidAmount)} of ${formatMoney(inv.amount)}`,
        body: `${clientOf(inv.clientId)} — balance of ${formatMoney(inv.amount - inv.paidAmount)} outstanding on ${inv.number}.`,
        createdAt: inv.dueOn, read: false, entity: { type: 'invoice', id: inv.id }, actionLabel: 'Review balance',
      })
    }
  })

  bookings.forEach((b) => {
    const inDays = daysBetween(today, b.start)
    const outDays = b.end ? daysBetween(today, b.end) : Number.POSITIVE_INFINITY
    if (b.status === 'upcoming' && inDays >= 0 && inDays <= 3) {
      out.push({
        id: `n-in-${b.id}`, kind: 'check_in', priority: inDays === 0 ? 'high' : 'normal',
        title: `Check-in ${inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : `in ${inDays} days`} · ${b.checkIn}`,
        body: `${clientOf(b.clientId)} arriving at ${nameOf(b.propertyId)} · ${b.guests} guest${b.guests > 1 ? 's' : ''} · ${b.reference}.`,
        createdAt: dayOffset(-1), read: false, entity: { type: 'booking', id: b.id }, actionLabel: 'Prepare arrival',
      })
    }
    if (b.status === 'in_progress' && b.mode === 'short_stay' && outDays >= 0 && outDays <= 2) {
      out.push({
        id: `n-out-${b.id}`, kind: 'check_out', priority: 'normal',
        title: `Check-out ${outDays === 0 ? 'today' : `in ${outDays} day${outDays > 1 ? 's' : ''}`} · ${b.checkOut}`,
        body: `${nameOf(b.propertyId)} — schedule turnover clean after ${clientOf(b.clientId)} departs.`,
        createdAt: dayOffset(0), read: false, entity: { type: 'booking', id: b.id }, actionLabel: 'Schedule turnover',
      })
    }
    /* An open-ended rental never expires — what matters is how far the rent
       is paid through, and whether the advance is running down. */
    if (b.mode === 'rental' && b.status === 'in_progress' && b.paidThrough) {
      const covered = daysBetween(today, b.paidThrough)
      if (covered < 0) {
        out.push({
          id: `n-rent-${b.id}`, kind: 'payment_overdue', priority: covered < -21 ? 'critical' : 'high',
          title: `Rent lapsed ${Math.abs(covered)} days ago`,
          body: `${clientOf(b.clientId)} at ${nameOf(b.propertyId)} is occupying beyond the paid period. Advance was ${b.advanceMonths} months at move-in.`,
          createdAt: b.paidThrough, read: false, entity: { type: 'booking', id: b.id }, actionLabel: 'Chase rent',
        })
      } else if (covered <= reminders.rentDueLeadDays * 3) {
        out.push({
          id: `n-rent-${b.id}`, kind: 'payment_due', priority: covered <= 7 ? 'high' : 'normal',
          title: `Rent covered for ${covered} more day${covered === 1 ? '' : 's'}`,
          body: `${clientOf(b.clientId)} at ${nameOf(b.propertyId)} is paid through ${b.paidThrough}. Collect the next month before it lapses.`,
          createdAt: dayOffset(-1), read: false, entity: { type: 'booking', id: b.id }, actionLabel: 'Request rent',
        })
      }
    }

    if (b.mode === 'long_term' && b.status === 'in_progress' && b.end) {
      const expiry = daysBetween(today, b.end)
      if (expiry >= 0 && expiry <= reminders.leaseExpiryLeadDays) {
        out.push({
          id: `n-lease-${b.id}`, kind: 'lease_expiry', priority: expiry <= 21 ? 'high' : 'normal',
          title: `Lease expires in ${expiry} days`,
          body: `${clientOf(b.clientId)} at ${nameOf(b.propertyId)} — decide on renewal or start re-marketing.`,
          createdAt: dayOffset(-2), read: false, entity: { type: 'booking', id: b.id }, actionLabel: 'Open renewal',
        })
      }
    }
  })

  properties.forEach((p) => {
    if (p.status === 'available' && p.availableFrom) {
      const vacantFor = Math.abs(daysBetween(p.availableFrom, today))
      if (vacantFor >= reminders.vacancyAlertDays) {
        out.push({
          id: `n-vac-${p.id}`, kind: 'vacancy', priority: vacantFor > 30 ? 'high' : 'normal',
          title: `Vacant ${vacantFor} days · ${formatMoney(p.mode === 'short_stay' ? p.price * 30 : p.price)} monthly exposure`,
          body: `${p.name} in ${p.address.district} has had no booking since ${p.availableFrom}.`,
          createdAt: dayOffset(-1), read: false, entity: { type: 'property', id: p.id }, actionLabel: 'Review listing',
        })
      }
    }
  })

  maintenance.forEach((m) => {
    if (m.status === 'completed') return
    const gap = daysBetween(today, m.dueOn)
    if (gap <= reminders.maintenanceLeadDays) {
      out.push({
        id: `n-mnt-${m.id}`, kind: 'maintenance',
        priority: m.priority === 'urgent' ? 'critical' : gap < 0 ? 'high' : 'normal',
        title: gap < 0 ? `Maintenance ${Math.abs(gap)} days overdue` : `Maintenance due ${gap === 0 ? 'today' : `in ${gap} day${gap > 1 ? 's' : ''}`}`,
        body: `${m.title} — ${nameOf(m.propertyId)} · ${m.vendor}.`,
        createdAt: dayOffset(Math.min(0, gap)), read: false, entity: { type: 'maintenance', id: m.id }, actionLabel: 'Open job',
      })
    }
  })

  /* Nothing is appended here. Every notification above is derived from a
     record that exists, so an empty portfolio produces an empty list —
     which is the honest answer, and the one a new deployment needs. */
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/* ------------------------------ helpers --------------------------- */
/** Notification copy is built from the same presentation settings as the
 *  rest of the UI, so a currency change reaches the alerts too. */
export function formatMoney(n: number) {
  const value = n * presentation.rate
  return new Intl.NumberFormat(presentation.locale, {
    style: 'currency',
    currency: presentation.currency,
    maximumFractionDigits: 0,
  }).format(value)
}
