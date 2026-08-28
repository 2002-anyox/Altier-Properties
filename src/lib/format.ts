import { TODAY, daysBetween, iso } from './dates.js'
import { presentation } from './money.js'

/**
 * Amounts are held in shillings and presented in the chosen currency.
 * `compact` switches to 1.2M / 4.5K once the number stops being readable,
 * which happens at a very different magnitude in each currency.
 */
export const money = (n: number, compact = false) => {
  const value = n * presentation.rate
  const useCompact = compact && Math.abs(value) >= presentation.compactFrom
  return new Intl.NumberFormat(presentation.locale, {
    style: 'currency',
    currency: presentation.currency,
    maximumFractionDigits: useCompact ? 1 : 0,
    minimumFractionDigits: 0,
    notation: useCompact ? 'compact' : 'standard',
  }).format(value)
}

export const num = (n: number, digits = 0) =>
  new Intl.NumberFormat(presentation.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)

/**
 * A percentage, or an em dash when there is nothing to take a percentage
 * of. A null here means the question has no answer — not that the answer
 * is zero — and the two must not look the same on screen.
 */
export const pct = (n: number | null | undefined, digits = 0) =>
  (n === null || n === undefined ? '—' : `${num(n, digits)}%`)

export const shortDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(presentation.locale, { day: 'numeric', month: 'short' })

export const mediumDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(presentation.locale, { day: 'numeric', month: 'short', year: 'numeric' })

export const longDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(presentation.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export const monthLabel = (d: Date) => d.toLocaleDateString(presentation.locale, { month: 'short' })

/** "in 4 days" / "today" / "12 days ago" — the phrasing the whole product uses for due dates. */
export function relativeDay(dateStr: string) {
  const gap = daysBetween(iso(TODAY), dateStr)
  if (gap === 0) return 'today'
  if (gap === 1) return 'tomorrow'
  if (gap === -1) return 'yesterday'
  if (gap > 0) return `in ${gap} day${gap === 1 ? '' : 's'}`
  return `${Math.abs(gap)} day${gap === -1 ? '' : 's'} ago`
}

export const initials = (name: string) =>
  name
    .replace(/[^A-Za-z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

export const titleCase = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export const sentence = (s: string) => {
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}
