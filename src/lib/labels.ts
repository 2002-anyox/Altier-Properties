/* ------------------------------------------------------------------ *
 * What things are called on screen
 *
 * A status in the database is `in_progress`. On screen it was
 * `in progress` — lowercase, in an interface that is sentence case
 * everywhere else — because eight places rendered the column value with
 * the underscores swapped for spaces and hoped.
 *
 * That is the schema talking to the customer. An enum is a storage
 * decision; what a person reads is a naming decision, and the two have no
 * reason to match. "Part paid" is not `partial`, a `booking` charge is a
 * stay, and `maintenance_recharge` is a repair recharged to the tenant.
 *
 * So every machine value that reaches a screen gets its name here, and
 * `titleOf` falls back gracefully rather than printing a raw value if a
 * new one is ever added and forgotten.
 * ------------------------------------------------------------------ */

import type { BookingStatus, ChargeType, InvoiceStatus, TenancyMode } from './types.js'

/**
 * Note `in_progress`: "Running" rather than "In residence".
 *
 * Whether the agreement has started and whether anybody is actually in
 * the building are two different facts — a tenancy runs from the day the
 * term opens, and the guest may not turn up until Thursday. The Bookings
 * page filters on both, so calling them the same thing would put two
 * chips reading "In residence" beside each other with different counts.
 */
export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  upcoming: 'Upcoming',
  in_progress: 'Running',
  completed: 'Completed',
  cancelled: 'Cancelled',
  pending: 'Unconfirmed',
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: 'Paid',
  pending: 'Pending',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
  partial: 'Part paid',
}

export const CHARGE_TYPE_LABEL: Record<ChargeType, string> = {
  rent: 'Rent',
  advance: 'Advance',
  booking: 'Stay',
  deposit: 'Deposit',
  utilities: 'Utilities',
  service_fee: 'Service fee',
  late_fee: 'Late fee',
  maintenance_recharge: 'Repair recharge',
  credit_note: 'Credit note',
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Bank transfer',
  card: 'Card',
  mobile_money: 'Mobile money',
  cash: 'Cash',
}

export const TENANCY_MODE_LABEL: Record<TenancyMode, string> = {
  long_term: 'Fixed-term lease',
  rental: 'Open-ended rental',
  short_stay: 'Short stay',
}

/**
 * A readable name for a machine value, from the map that covers it.
 *
 * The fallback capitalises rather than printing `awaiting_parts`, so a
 * value added to an enum and forgotten here degrades to something a
 * person can still read instead of leaking the schema.
 */
export function titleOf(value: string, map?: Record<string, string>): string {
  if (map && map[value]) return map[value]
  const spaced = value.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
