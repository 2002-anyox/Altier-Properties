import { TODAY, daysBetween, iso } from './data'

export const money = (n: number, currency = 'EUR', compact = false) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    notation: compact && Math.abs(n) >= 10000 ? 'compact' : 'standard',
  }).format(n)

export const num = (n: number, digits = 0) =>
  new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)

export const pct = (n: number, digits = 0) => `${num(n, digits)}%`

export const shortDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export const mediumDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export const longDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export const monthLabel = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short' })

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
