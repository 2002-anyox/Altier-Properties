import { TODAY, daysBetween, iso } from './data'
import { presentation } from './money'

/**
 * Amounts are held in EUR and presented in the chosen currency.
 * `compact` switches to 1.2M / 4.5K once the number stops being readable —
 * which happens far sooner in shilling-denominated currencies.
 */
export const money = (n: number, compact = false) => {
  const value = n * presentation.rate
  const threshold = presentation.rate >= 100 ? 1_000_000 : 10_000
  return new Intl.NumberFormat(presentation.locale, {
    style: 'currency',
    currency: presentation.currency,
    maximumFractionDigits: compact && Math.abs(value) >= threshold ? 1 : presentation.decimals,
    minimumFractionDigits: 0,
    notation: compact && Math.abs(value) >= threshold ? 'compact' : 'standard',
  }).format(value)
}

export const num = (n: number, digits = 0) =>
  new Intl.NumberFormat(presentation.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)

export const pct = (n: number, digits = 0) => `${num(n, digits)}%`

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
