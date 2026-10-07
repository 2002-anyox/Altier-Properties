/* ------------------------------------------------------------------ *
 * Dates
 *
 * Every date in this app is an ISO day string — 'YYYY-MM-DD' — because
 * that is what the database stores, what sorts correctly as text, and
 * what a lease or an invoice actually means. Times of day belong to
 * check-in and check-out, and nothing else here has one.
 * ------------------------------------------------------------------ */

/** Midnight today, local. The anchor every "in N days" figure counts from. */
export const TODAY = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})()

/**
 * The calendar day a Date falls on, where the reader is.
 *
 * Deliberately not toISOString(), which converts to UTC first. Local
 * midnight in Kampala is 21:00 the previous day in UTC, so that version
 * returned yesterday's date for every user east of Greenwich — and this
 * is a product built for Uganda. The 28th read as "tomorrow" all through
 * the 28th, every due date was a day out, and "overdue by 3 days" meant
 * four.
 *
 * Every other helper here already treats a 'YYYY-MM-DD' as local midnight
 * — `new Date(d + 'T00:00:00')` has no zone suffix, so it is parsed local
 * — which is what made this one wrong rather than merely different.
 */
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const addDays = (d: Date | string, n: number) => {
  const base = typeof d === 'string' ? new Date(d + 'T00:00:00') : new Date(d)
  base.setDate(base.getDate() + n)
  return base
}

export const dayOffset = (n: number) => iso(addDays(TODAY, n))

export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)

/**
 * The calendar day in a named zone, as 'YYYY-MM-DD'.
 *
 * For the server, which has no local calendar worth trusting — it runs
 * wherever the host puts it — and has to stamp dates in the workspace's
 * own. en-CA is the shortest way to ask Intl for this format.
 */
export const dayIn = (timezone: string, at = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(at)

/**
 * A calendar date some whole months on, held to the last day of a month
 * that is too short to have the same day.
 *
 * The version this replaces let Date overflow: 31 January plus a month
 * became 3 March, so a rental started at a month's end earned over 31
 * days where 28 were priced — and since every settlement takes its daily
 * rate as amount over span, that diluted the rate for the whole
 * agreement. Worked in UTC on the date parts, so no timezone or DST can
 * move it either.
 *
 * Step a series from its anchor rather than chaining: the anchor plus two
 * months from 31 January is 31 March, where 28 February plus one is 28
 * March.
 */
export function addMonths(from: string, months: number): string {
  const [y, m, d] = from.slice(0, 10).split('-').map(Number)
  const total = (m - 1) + months
  const year = y + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(d, last)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

