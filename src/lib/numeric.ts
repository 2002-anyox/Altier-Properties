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
 * Whether a keystroke may land in the box at all.
 *
 * Deliberately permissive about incomplete text: '', '-', '1.' and ','
 * are all on the way to a number somebody is still typing, and refusing
 * them is what makes a field feel stuck.
 */
export const acceptable = (raw: string) => SHAPE.test(raw)

/** The number the text says, or null while it does not say one yet. */
export function readNumber(raw: string): number | null {
  if (raw.trim() === '') return null
  const parsed = Number(raw.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
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
export function commitNumber(raw: string, bounds: Bounds = {}): number {
  const parsed = readNumber(raw)
  return clampNumber(parsed ?? bounds.min ?? 0, bounds)
}
