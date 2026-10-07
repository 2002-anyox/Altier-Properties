/* ------------------------------------------------------------------ *
 * Typing a number
 *
 * Bound a `<input type="number">` straight to a number and there is a
 * trap waiting in it: clearing the box makes `Number('')` zero, a floor
 * pulls that back up to the minimum, and the old digit reappears under
 * the cursor. Somebody trying to change 3 months to 12 can only type in
 * front of the 3, which is how you end up with 123.
 *
 * The way out is to let the half-typed text exist. These are the four
 * decisions that takes, kept apart from React so they can be checked
 * without a browser.
 * ------------------------------------------------------------------ */

export interface Bounds {
  min?: number
  max?: number
}

/** Digits, one decimal point, an optional leading minus — and nothing else. */
const SHAPE = /^-?[0-9]*[.,]?[0-9]*$/

/**
 * The same, for a field holding money.
 *
 * Shillings have no subunit anybody uses and the schema stores whole
 * units, so a separator in a money box is somebody reading a figure off a
 * page — not a decimal point. Several are allowed, because 2,500,000 has
 * two, and each prefix on the way to typing it has to be acceptable or
 * the box feels stuck.
 */
const MONEY_SHAPE = /^-?[0-9]*(?:[.,\u00a0\u2009 '][0-9]*)*$/

/** Grouping, in the forms people type or paste. */
const GROUPING = /[.,\u00a0\u2009 ']/g

/**
 * Whether a keystroke may land in the box at all.
 *
 * Deliberately permissive about incomplete text: '', '-', '1.' and ','
 * are all on the way to a number somebody is still typing, and refusing
 * them is what makes a field feel stuck.
 */
export const acceptable = (raw: string, money = false) =>
  (money ? MONEY_SHAPE : SHAPE).test(raw)

/**
 * The number the text says, or null while it does not say one yet.
 *
 * In a money field the separators are grouping and come out. They used to
 * be read as a decimal point, and only one was allowed: typing a rent the
 * way it is written — 2,500,000 — left "2,500000" in the box, which
 * became 2.5. Two and a half shillings, with the Create button still lit.
 */
export function readNumber(raw: string, money = false): number | null {
  const text = money ? raw.replace(GROUPING, '') : raw
  if (text.trim() === '' || text.trim() === '-') return null
  const parsed = Number(money ? text : text.replace(',', '.'))
  if (!Number.isFinite(parsed)) return null
  return money ? Math.round(parsed) : parsed
}

/**
 * A money figure as it is written, so a long one can be checked at a
 * glance. The box showed 2500000 and left the reader to count zeros.
 */
export function groupDigits(value: number): string {
  const negative = value < 0
  const digits = String(Math.abs(Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return negative ? `-${digits}` : digits
}

export function clampNumber(value: number, bounds: Bounds = {}): number {
  let out = value
  if (bounds.min !== undefined) out = Math.max(bounds.min, out)
  if (bounds.max !== undefined) out = Math.min(bounds.max, out)
  return out
}

/**
 * What the field settles on once it is left.
 *
 * This is the only place the bounds are applied. Applying them a
 * keystroke earlier is precisely the bug: '1' on the way to '12' is
 * below a floor of 3, and squaring it up there would overwrite what
 * somebody was in the middle of typing.
 */
export function commitNumber(raw: string, bounds: Bounds = {}, money = false): number {
  const parsed = readNumber(raw, money)
  return clampNumber(parsed ?? bounds.min ?? 0, bounds)
}
