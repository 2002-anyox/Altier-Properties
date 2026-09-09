/* ------------------------------------------------------------------ *
 * Days spent, and what they cost
 *
 * An agreement is priced before anybody has stayed anywhere. Then real
 * life happens: a guest booked for seven nights leaves on the fourth, a
 * tenant who paid three months up front gives notice in the second, and
 * somebody who should have been gone on Friday is still there on Tuesday.
 * The money has to follow.
 *
 * So the bill is not the figure that was agreed — it is the figure the
 * days actually earn. This is the arithmetic that turns one into the
 * other, and it lives here, away from the database and away from the
 * screen, because a settlement is the kind of thing somebody will one day
 * dispute and it should be possible to show your working.
 *
 * One rule runs through all of it: a day is worth what the client was
 * already being charged for it. The daily rate is divided back out of the
 * charges themselves rather than re-derived from the rent, so a
 * settlement can never disagree with the revenue the dashboard has
 * already recognised for those same days. Both read the charge's own
 * earning window; they just read it in opposite directions.
 * ------------------------------------------------------------------ */

import { daysBetween } from './dates.js'
import { chargeSign } from './derive.js'
import type { Booking, ChargeType, Invoice } from './types.js'

/**
 * Charges that buy time.
 *
 * Rent, an advance and a stay all pay for days. A deposit buys nothing —
 * it is the client's own money, held. Utilities, fees and recharges pay
 * for things that happened rather than for time that passed, so leaving
 * early does not refund them and staying on does not multiply them.
 */
const TIME_TYPES: ChargeType[] = ['rent', 'advance', 'booking']

export const buysTime = (type: ChargeType) => TIME_TYPES.includes(type)

/** A charge, reduced to the only three things a settlement reads. */
export interface TimeCharge {
  amount: number
  earnsFrom: string
  earnsTo: string
}

/**
 * A stretch of days, half-open like every other period here: `from` is
 * the first day and `to` is the day after the last. That is what makes a
 * same-day arrival and departure one day rather than none, and what stops
 * two consecutive tenancies both claiming the changeover.
 */
export interface Window {
  from: string
  to: string
  days: number
}

const DAY = 86_400_000
const at = (d: string) => new Date(`${d}T00:00:00`).getTime()
const windowOf = (from: string, to: string): Window =>
  ({ from, to, days: Math.max(0, daysBetween(from, to)) })

/**
 * Days two half-open windows have in common.
 *
 * Rounded, because these are calendar days and a calendar day is not
 * always 86,400,000 milliseconds long. In a timezone that puts its clocks
 * forward, a ninety-day advance measures 89.958 days by division, and a
 * refund of the unused part came out 695 shillings short — small enough
 * to survive every review and large enough to be wrong.
 */
export function overlapDays(aFrom: string, aTo: string, bFrom: string, bTo: string) {
  const from = Math.max(at(aFrom), at(bFrom))
  const to = Math.min(at(aTo), at(bTo))
  return Math.max(0, Math.round((to - from) / DAY))
}

/** Overlapping and touching windows folded into the fewest that cover the same days. */
export function mergeWindows(windows: Array<{ from: string; to: string }>): Window[] {
  const sorted = windows
    .filter((w) => at(w.to) > at(w.from))
    .sort((a, b) => at(a.from) - at(b.from))

  const out: Window[] = []
  for (const w of sorted) {
    const last = out[out.length - 1]
    if (last && at(w.from) <= at(last.to)) {
      if (at(w.to) > at(last.to)) out[out.length - 1] = windowOf(last.from, w.to)
    } else {
      out.push(windowOf(w.from, w.to))
    }
  }
  return out
}

/** The parts of `whole` that none of `covers` reaches. */
export function gapsIn(whole: Window, covers: Array<{ from: string; to: string }>): Window[] {
  if (whole.days <= 0) return []
  const out: Window[] = []
  let cursor = whole.from
  for (const c of mergeWindows(covers)) {
    if (at(c.to) <= at(cursor)) continue
    if (at(c.from) >= at(whole.to)) break
    if (at(c.from) > at(cursor)) out.push(windowOf(cursor, c.from))
    cursor = c.to
    if (at(cursor) >= at(whole.to)) break
  }
  if (at(cursor) < at(whole.to)) out.push(windowOf(cursor, whole.to))
  return out.filter((w) => w.days > 0)
}

/* ---------------------------- the occupancy ------------------------ */

/**
 * The days a client is on the hook for.
 *
 * The window opens the day the home came off the market — the agreed
 * start, or the arrival if they turned up before it — and closes on the
 * day they left.
 *
 * Arriving late earns no refund: the home was held empty and unlettable
 * in the meantime, and that is the thing that was bought. Leaving early
 * does, because from that day it is back on the market and free to earn
 * again.
 *
 * The departure day itself is not billed, which is not a rounding choice
 * but the same half-open convention every other period here uses: an
 * agreement running the 10th to the 17th is seven nights, and the 17th
 * belongs to whoever comes next. Counting it would bill two people for
 * the same changeover day, and would disagree with the earning window on
 * the charge it is being compared against.
 *
 * While somebody is still in residence there is no departure to read, so
 * the window runs to `on`. That makes this the same arithmetic as "what
 * would they owe if they walked out today" — a question worth being able
 * to answer before anybody walks out.
 */
export function stayWindow(
  booking: Pick<Booking, 'start' | 'arrivedOn' | 'departedOn'>,
  on: string,
): Window {
  const from = booking.arrivedOn && booking.arrivedOn < booking.start
    ? booking.arrivedOn
    : booking.start
  const to = booking.departedOn ?? on
  return windowOf(from, to < from ? from : to)
}

/* --------------------------- what was billed ----------------------- */

/** The charges on an agreement that pay for time, in date order. */
export const timeCharges = (invoices: Invoice[], bookingId: string): Invoice[] =>
  invoices
    .filter((i) => i.bookingId === bookingId && buysTime(i.type))
    .sort((a, b) => (a.earnsFrom < b.earnsFrom ? -1 : a.earnsFrom > b.earnsFrom ? 1 : 0))

const span = (c: TimeCharge) => Math.max(0, Math.round((at(c.earnsTo) - at(c.earnsFrom)) / DAY))

/**
 * What a set of charges is worth over a given window.
 *
 * Each charge spread evenly across its own earning period, then read
 * across the days asked about. This is the same day-by-day division the
 * revenue figures use, which is the point: what a settlement gives back
 * for a day is exactly what the dashboard recognised for it.
 */
export function valueOver(charges: TimeCharge[], w: { from: string; to: string }): number {
  let out = 0
  for (const c of charges) {
    const length = span(c)
    if (length <= 0) continue
    const shared = overlapDays(c.earnsFrom, c.earnsTo, w.from, w.to)
    if (shared > 0) out += c.amount * (shared / length)
  }
  return out
}

/**
 * What one more day costs.
 *
 * The rate already running, taken from whichever charge reaches furthest
 * into the future — an overstay continues the terms that were in force
 * rather than inventing a price for the occasion. With nothing charged
 * yet, fall back to the agreement itself: a nightly rate as written, and
 * a month spread over the average month, which is the convention that
 * keeps twelve of them adding up to a year.
 */
export function dailyRate(
  charges: TimeCharge[],
  booking: Pick<Booking, 'mode' | 'rate'>,
): number {
  const latest = charges.reduce<TimeCharge | null>(
    (best, c) => (span(c) > 0 && (!best || c.earnsTo > best.earnsTo) ? c : best),
    null,
  )
  if (latest) return latest.amount / span(latest)
  return booking.mode === 'short_stay' ? booking.rate : (booking.rate * 12) / 365
}

/* ---------------------------- the settlement ----------------------- */

export interface Settlement {
  /** The days actually occupied. */
  stay: Window
  daysStayed: number
  /** Days the charges on the agreement pay for. */
  daysBilled: number
  /** What a day costs, at the terms that were running. */
  dailyRate: number
  /** Paid-for stretches nobody used, and the money in them. */
  unused: Window[]
  unusedDays: number
  credit: number
  /** Stretches lived through that no charge covers, and what they come to. */
  extra: Window[]
  extraDays: number
  due: number
  /** Unpaid balance on the agreement before any of this. */
  outstanding: number
  /**
   * Where the account lands once the adjustment is raised. Positive means
   * the client still owes; negative means the business owes them.
   */
  balance: number
  /** Whether there is anything to raise at all. */
  adjusts: boolean
}

const round = (n: number) => Math.round(n)
const sumDays = (ws: Window[]) => ws.reduce((a, w) => a + w.days, 0)

/**
 * Reconcile an agreement against the days actually spent.
 *
 * Two things can be wrong at a departure, and they are not opposites:
 * some of what was charged bought days nobody used, and some of the days
 * used were never charged for. A tenant who paid a quarter up front,
 * moved out two months in and then came back for a fortnight has both at
 * once — so both are worked out, and neither is netted away before
 * anybody has had the chance to see it.
 */
export function settleStay(
  booking: Pick<Booking, 'id' | 'mode' | 'rate' | 'start' | 'arrivedOn' | 'departedOn'>,
  invoices: Invoice[],
  on: string,
): Settlement {
  const stay = stayWindow(booking, on)
  const charges = timeCharges(invoices, booking.id)
  const charged = mergeWindows(charges.map((c) => ({ from: c.earnsFrom, to: c.earnsTo })))

  /* Days paid for that fall outside the stay: what the charges cover,
     with the occupancy cut out of it. */
  const unused = charged.flatMap((w) => gapsIn(w, [stay]))

  /* And the reverse: days lived through that nothing covers. */
  const extra = gapsIn(stay, charged)
  const rate = dailyRate(charges, booking)

  /* Rounded once per window and then added, which is how the documents
     themselves are raised — rounding the total instead would put the
     figure on the check-out screen a shilling away from the figure on
     the credit note, and a shilling is enough to make somebody wonder
     what else is approximate. */
  const credit = unused.reduce((a, w) => a + round(valueOver(charges, w)), 0)
  const due = extra.reduce((a, w) => a + round(w.days * rate), 0)

  /* Everything on the agreement, not only the charges that buy time — a
     departure is the moment somebody asks whether the account is clear,
     and an unpaid water bill is part of that answer. Credit notes already
     raised count the other way. */
  const outstanding = invoices
    .filter((i) => i.bookingId === booking.id)
    .reduce((a, i) => a + chargeSign(i.type) * (i.amount - i.paidAmount), 0)

  return {
    stay,
    daysStayed: stay.days,
    daysBilled: charges.reduce((a, c) => a + span(c), 0),
    dailyRate: rate,
    unused,
    unusedDays: sumDays(unused),
    credit,
    extra,
    extraDays: sumDays(extra),
    due,
    outstanding,
    balance: outstanding + due - credit,
    adjusts: credit > 0 || due > 0,
  }
}

/** How the adjustment reads on a bill, in the words that justify it. */
export const creditNote = (days: number, reference: string) =>
  `${days} unused day${days === 1 ? '' : 's'} credited — ${reference}`

export const extraNote = (days: number, reference: string) =>
  `${days} day${days === 1 ? '' : 's'} beyond what was billed — ${reference}`
