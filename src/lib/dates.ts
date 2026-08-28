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

export const iso = (d: Date) => d.toISOString().slice(0, 10)

export const addDays = (d: Date | string, n: number) => {
  const base = typeof d === 'string' ? new Date(d + 'T00:00:00') : new Date(d)
  base.setDate(base.getDate() + n)
  return base
}

export const dayOffset = (n: number) => iso(addDays(TODAY, n))

export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
