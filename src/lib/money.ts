/* ------------------------------------------------------------------ *
 * Currency and region
 *
 * The portfolio is priced in Ugandan shillings. Everything on screen is
 * converted at display time, so switching currency never rewrites the
 * underlying figures — the same way a real system holds one booking
 * currency and presents another.
 *
 * The conversion rates below are fixed in the build, not live FX, and
 * they are for reading a figure in a familiar unit — never for billing.
 * A deployment that actually charges in more than one currency needs a
 * rates provider, and needs to stamp each invoice with the rate used when
 * it was raised, so historic figures never drift.
 * ------------------------------------------------------------------ */

export const BASE_CURRENCY = 'UGX'

export interface CurrencyDef {
  code: string
  label: string
  /** Shillings one unit of this currency is worth. */
  ugxPerUnit: number
  /** Above this displayed value, switch to compact form (1.2M, 4.5K). */
  compactFrom: number
}

export const CURRENCIES: CurrencyDef[] = [
  { code: 'UGX', label: 'Ugandan shilling', ugxPerUnit: 1, compactFrom: 1_000_000 },
  { code: 'KES', label: 'Kenyan shilling', ugxPerUnit: 28.5, compactFrom: 100_000 },
  { code: 'TZS', label: 'Tanzanian shilling', ugxPerUnit: 1.42, compactFrom: 1_000_000 },
  { code: 'RWF', label: 'Rwandan franc', ugxPerUnit: 2.85, compactFrom: 1_000_000 },
  { code: 'NGN', label: 'Nigerian naira', ugxPerUnit: 2.39, compactFrom: 100_000 },
  { code: 'GHS', label: 'Ghanaian cedi', ugxPerUnit: 239, compactFrom: 100_000 },
  { code: 'ZAR', label: 'South African rand', ugxPerUnit: 200, compactFrom: 100_000 },
  { code: 'USD', label: 'US dollar', ugxPerUnit: 3700, compactFrom: 10_000 },
  { code: 'GBP', label: 'Pound sterling', ugxPerUnit: 4700, compactFrom: 10_000 },
  { code: 'EUR', label: 'Euro', ugxPerUnit: 4000, compactFrom: 10_000 },
]

export interface RegionDef {
  locale: string
  label: string
  /** The currency this region defaults to when it is chosen. */
  currency: string
}

export const REGIONS: RegionDef[] = [
  { locale: 'en-UG', label: 'Uganda', currency: 'UGX' },
  { locale: 'en-KE', label: 'Kenya', currency: 'KES' },
  { locale: 'en-TZ', label: 'Tanzania', currency: 'TZS' },
  { locale: 'en-RW', label: 'Rwanda', currency: 'RWF' },
  { locale: 'en-NG', label: 'Nigeria', currency: 'NGN' },
  { locale: 'en-GH', label: 'Ghana', currency: 'GHS' },
  { locale: 'en-ZA', label: 'South Africa', currency: 'ZAR' },
  { locale: 'en-GB', label: 'United Kingdom', currency: 'GBP' },
  { locale: 'en-US', label: 'United States', currency: 'USD' },
  { locale: 'en-IE', label: 'Ireland (euro)', currency: 'EUR' },
]

export const currencyDef = (code: string) =>
  CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]

export const regionDef = (locale: string) =>
  REGIONS.find((r) => r.locale === locale) ?? REGIONS[0]

/* The active presentation settings. Read during render by the format
   helpers so call sites stay `money(n)` rather than threading context
   through every component. Written by the store before it renders its
   children, so a change is visible on the very next render. */
export const presentation = {
  locale: 'en-UG',
  currency: 'UGX',
  /** Multiplier from the base currency to the displayed one. */
  rate: 1,
  compactFrom: 1_000_000,
}

/**
 * A base-currency amount in whatever currency is on screen, as a bare
 * number. For exports: a spreadsheet wants 2500000, not "USh 2.5M", and
 * the column header carries the currency instead.
 */
export const amountIn = (base: number) =>
  Math.round(base * presentation.rate * 100) / 100

export function setPresentation(locale: string, currency: string) {
  const def = currencyDef(currency)
  presentation.locale = locale
  presentation.currency = def.code
  presentation.rate = 1 / def.ugxPerUnit
  presentation.compactFrom = def.compactFrom
}
