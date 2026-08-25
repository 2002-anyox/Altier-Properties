/* ------------------------------------------------------------------ *
 * Currency and region
 *
 * The sample portfolio is priced in EUR. Everything on screen is
 * converted at display time, so switching currency never rewrites the
 * underlying figures — the same way a real system holds one booking
 * currency and presents another.
 *
 * Rates are indicative demo values, not live FX. A production build
 * would read them from a rates provider and stamp each invoice with the
 * rate used at the time it was raised.
 * ------------------------------------------------------------------ */

export interface CurrencyDef {
  code: string
  label: string
  /** Units per 1 EUR. */
  rate: number
  /** Currencies with no minor unit in daily use are shown whole. */
  decimals: number
}

export const CURRENCIES: CurrencyDef[] = [
  { code: 'UGX', label: 'Ugandan shilling', rate: 4000, decimals: 0 },
  { code: 'KES', label: 'Kenyan shilling', rate: 140, decimals: 0 },
  { code: 'TZS', label: 'Tanzanian shilling', rate: 2800, decimals: 0 },
  { code: 'RWF', label: 'Rwandan franc', rate: 1400, decimals: 0 },
  { code: 'NGN', label: 'Nigerian naira', rate: 1700, decimals: 0 },
  { code: 'GHS', label: 'Ghanaian cedi', rate: 16, decimals: 0 },
  { code: 'ZAR', label: 'South African rand', rate: 20, decimals: 0 },
  { code: 'USD', label: 'US dollar', rate: 1.08, decimals: 0 },
  { code: 'GBP', label: 'Pound sterling', rate: 0.85, decimals: 0 },
  { code: 'EUR', label: 'Euro', rate: 1, decimals: 0 },
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
  CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[CURRENCIES.length - 1]

export const regionDef = (locale: string) =>
  REGIONS.find((r) => r.locale === locale) ?? REGIONS[REGIONS.length - 1]

/* The active presentation settings. Read during render by the format
   helpers so call sites stay `money(n)` rather than threading context
   through every component. Written by the store before it renders its
   children, so a change is visible on the very next render. */
export const presentation = {
  locale: 'en-GB',
  currency: 'EUR',
  rate: 1,
  decimals: 0,
}

export function setPresentation(locale: string, currency: string) {
  const def = currencyDef(currency)
  presentation.locale = locale
  presentation.currency = def.code
  presentation.rate = def.rate
  presentation.decimals = def.decimals
}
