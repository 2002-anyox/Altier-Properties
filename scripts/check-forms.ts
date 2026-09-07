/* ------------------------------------------------------------------ *
 * The forms let you finish typing
 *
 * "On the months paid upfront, the number 3 can not be changed unless
 * you type in front of it." That is a real trap and it had a precise
 * cause: the field clamped on every keystroke. Clear the box and
 * Number('') is 0; Math.max(3, 0) is 3; the 3 is back before the finger
 * is off the key. The only edit left is to prepend, which turns 3 into
 * 123.
 *
 * These replay what somebody's hands actually do — select and overtype,
 * backspace to empty and retype, type a two-digit number one digit at a
 * time — and assert the field lets them.
 *
 *   npm run check:forms
 * ------------------------------------------------------------------ */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { acceptable, clampNumber, commitNumber, readNumber } from '../src/lib/numeric.js'
import { advanceFloor, emptyBookingDraft, newBooking } from '../src/lib/create.js'
import { fieldsFor, modeSummary } from '../src/lib/agreement.js'
import { holdBlocking, holdsOf, isHolding, whyBlocked } from '../src/lib/occupancy.js'
import { onEarth, pinOf, roundPin } from '../src/lib/geo.js'
import type { Hold } from '../src/lib/occupancy.js'
import type { Bounds } from '../src/lib/numeric.js'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

/**
 * A field somebody is typing into: the text in the box, and the number
 * the form has been told about. Exactly the two pieces of state
 * NumberInput holds, so what happens here is what happens on screen.
 */
class Field {
  text: string
  reported: number

  constructor(start: number, private bounds: Bounds) {
    this.text = String(start)
    this.reported = start
  }

  /** A keystroke. `raw` is what the box would contain afterwards. */
  type(raw: string) {
    if (!acceptable(raw)) return this
    this.text = raw
    const parsed = readNumber(raw)
    if (parsed !== null) this.reported = parsed
    return this
  }

  /** Typing several characters in a row, from wherever the text is now. */
  append(chars: string) {
    for (const ch of chars) this.type(this.text + ch)
    return this
  }

  /**
   * Backspace, held down until the box is empty.
   *
   * Bounded, because a field that refuses the shorter text simply never
   * shrinks — and a check that hangs is a check nobody reads. Stopping
   * leaves the text as it was, which is exactly what the assertions
   * below then catch.
   */
  clear() {
    for (let guard = this.text.length; guard >= 0; guard -= 1) {
      if (this.text === '') break
      const before = this.text
      this.type(this.text.slice(0, -1))
      if (this.text === before) break
    }
    return this
  }

  /** Leaving the field — the one moment the bounds apply. */
  blur() {
    this.reported = commitNumber(this.text, this.bounds)
    this.text = String(this.reported)
    return this
  }
}

const floor = advanceFloor('rental')
const months = () => new Field(3, { min: floor })

console.log('\nMonths paid up front — a field with a floor of 3\n')

check('starts on the floor', months().reported === 3)

{
  /* The reported bug, exactly: clear the box, type 12. */
  const f = months().clear()
  check('the box can be emptied', f.text === '', `text is "${f.text}"`)
  f.append('12').blur()
  check('12 replaces 3', f.reported === 12 && f.text === '12', `ended on ${f.text}`)
}

{
  /* The half-typed digit is the whole difference. '1' is under the floor,
     and a field that squares up per keystroke rewrites it to 3 — after
     which the next '2' makes 32, not 12. */
  const f = months().clear().type('1')
  check('a lone 1 survives long enough to become 12', f.text === '1', `text is "${f.text}"`)
  f.append('2')
  check('and it does become 12', f.text === '12', `text is "${f.text}"`)
}

{
  /* Select-all and overtype: the browser replaces the selection, so the
     box goes straight from "3" to "6". */
  const f = months().type('6').blur()
  check('overtyping 3 with 6 gives 6', f.reported === 6)
}

{
  const f = months().clear().blur()
  check('left empty, it settles on the floor', f.reported === 3 && f.text === '3')
}

{
  const f = months().clear().type('1').blur()
  check('below the floor, it is squared up on the way out', f.reported === 3)
}

{
  const f = months().clear().append('24').blur()
  check('a two-year advance is allowed through', f.reported === 24)
}

console.log('\nOther numeric fields\n')

{
  const rent = new Field(0, { min: 0 })
  rent.clear().append('1500000').blur()
  check('rent takes seven digits one at a time', rent.reported === 1_500_000)
}

{
  const guests = new Field(2, { min: 1 })
  guests.clear().blur()
  check('occupants cannot be emptied to nothing', guests.reported === 1)
}

{
  const rating = new Field(0, { min: 0, max: 5 })
  rating.clear().append('9').blur()
  check('a maximum still holds on the way out', rating.reported === 5)
}

{
  const size = new Field(110, { min: 0 })
  size.clear().append('92.5').blur()
  check('a decimal can be typed through its point', size.reported === 92.5, `got ${size.reported}`)
}

{
  const f = new Field(3, { min: floor })
  f.type('abc')
  check('letters are refused without disturbing the value', f.text === '3')
}

console.log('\nThe clamp is still there — it just waits\n')

check('commit squares up below the floor', commitNumber('1', { min: 3 }) === 3)
check('commit squares up above the ceiling', commitNumber('9', { max: 5 }) === 5)
check('commit of nothing is the floor', commitNumber('', { min: 3 }) === 3)
check('commit of nonsense is the floor', commitNumber('-', { min: 3 }) === 3)
check('clamp is untouched by all this', clampNumber(7, { min: 0, max: 5 }) === 5)

/* And the agreement itself still refuses a rental opened on less than the
   floor, whatever the field was left showing. The form is a convenience;
   this is the rule. */
{
  const draft = { ...emptyBookingDraft('p1', 'c1'), mode: 'rental' as const, advanceMonths: 1 }
  const booking = newBooking(draft, [])
  check('a rental is still opened on at least three months', booking.advanceMonths === floor,
    `got ${booking.advanceMonths}`)
}

console.log('\nThe form asks for what the agreement needs\n')

{
  const shortStay = fieldsFor('short_stay')
  const rental = fieldsFor('rental')
  const lease = fieldsFor('long_term')

  check('a short stay asks for a departure date', shortStay.end)
  check('a short stay does not ask for months up front', !shortStay.advance)
  check('a short stay does not ask for notice', !shortStay.notice)
  check('a short stay asks what time they arrive', shortStay.times)

  check('an open-ended rental has no end date to ask for', !rental.end)
  check('an open-ended rental asks for months up front', rental.advance)
  check('an open-ended rental asks for notice', rental.notice)

  check('a fixed-term lease asks for an end date', lease.end)
  check('a fixed-term lease does not ask for months up front', !lease.advance)
  check('a fixed-term lease asks for notice', lease.notice)

  check('every mode explains itself', ['short_stay', 'rental', 'long_term']
    .every((m) => modeSummary(m as never).length > 20))
}

console.log('\nA client holds one home at a time\n')

{
  const hold = (over: Partial<Hold> = {}): Hold => ({
    id: 'b1', clientId: 'c1', propertyId: 'p1', status: 'in_progress', departedOn: null, ...over,
  })

  check('a running agreement holds its unit', isHolding(hold()))
  check('an upcoming one holds it too', isHolding(hold({ status: 'upcoming' })))
  check('a pending one holds it too', isHolding(hold({ status: 'pending' })))
  check('checked out, it lets go', !isHolding(hold({ departedOn: '2026-09-01' })))
  check('completed, it lets go', !isHolding(hold({ status: 'completed' })))
  check('cancelled, it lets go', !isHolding(hold({ status: 'cancelled' })))

  /* The date is deliberately not consulted. A lease whose end date passed
     on Friday still has somebody's furniture in it on Monday. */
  check('an overdue end date does not evict anybody',
    isHolding(hold({ status: 'in_progress', departedOn: null })))

  const live = [hold()]
  check('a second home is refused while the first is held',
    holdBlocking(live, 'c1', 'p2')?.propertyId === 'p1')
  check('the same home is not refused — a renewal is the same home',
    holdBlocking(live, 'c1', 'p1') === null)
  check('somebody else is not blocked by it', holdBlocking(live, 'c2', 'p2') === null)

  const movedOut = [hold({ departedOn: '2026-09-01' })]
  check('once they have moved out, the next home is allowed',
    holdBlocking(movedOut, 'c1', 'p2') === null)

  const two = [hold({ id: 'b1' }), hold({ id: 'b2', propertyId: 'p2', status: 'completed' })]
  check('holds count only what is still held', holdsOf(two, 'c1').length === 1)

  const reason = whyBlocked('Achieng Nakato', 'Kololo Heights 4B', 'Bugolobi Court 2A')
  check('the refusal names both homes and the person',
    reason.includes('Achieng Nakato') && reason.includes('Kololo Heights 4B')
      && reason.includes('Bugolobi Court 2A'),
    reason)
  check('the refusal says what to do about it', reason.includes('Check them out'))
}

console.log('\nPins are real coordinates or nothing\n')

{
  check('a pinned address reads back', pinOf({ lat: 0.335, lng: 32.59 })?.lat === 0.335)
  check('an unpinned one is null', pinOf({ lat: null, lng: null }) === null)
  /* Half a pin is a point in the Gulf of Guinea — where every mis-set
     coordinate on earth ends up — so it counts as no pin at all. */
  check('half a pin is no pin', pinOf({ lat: 0.335, lng: null }) === null)
  check('the other half is no pin either', pinOf({ lat: null, lng: 32.59 }) === null)

  check('Kampala is on the planet', onEarth({ lat: 0.3476, lng: 32.5825 }))
  check('a latitude past the pole is not', !onEarth({ lat: 91, lng: 32 }))
  check('nor a longitude past the date line', !onEarth({ lat: 0, lng: 181 }))
  check('nor a NaN that slipped through a form', !onEarth({ lat: Number.NaN, lng: 32 }))

  check('a pin is rounded to about ten centimetres', roundPin(0.34761234567) === 0.347612)
}

console.log('\nNo form goes back to a raw number box\n')

{
  /* The assertions above exercise numeric.ts. This ties them to what is
     on screen: a form that binds `<Input type="number">` straight to a
     number brings the whole trap back, and nothing above would notice. */
  const sources: Array<[string, string]> = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name)) sources.push([path, readFileSync(path, 'utf8')])
    }
  }
  walk('src')

  const offenders = sources.filter(([path, text]) =>
    path !== join('src', 'lib', 'numeric.ts')
    && path !== join('src', 'components', 'ui', 'index.tsx')
    && /type="number"/.test(text))
  check('nothing under src binds a raw number input',
    offenders.length === 0,
    offenders.map(([path]) => path).join(', '))

  const [, ui] = sources.find(([path]) => path === join('src', 'components', 'ui', 'index.tsx'))!
  const component = ui.slice(ui.indexOf('export function NumberInput'), ui.indexOf('export function Textarea'))
  check('NumberInput exists to be used', component.length > 200)
  /* The clamp belongs in commit() and nowhere near the keystroke handler.
     Squaring the value up as it is typed is the original bug. */
  const onChange = component
    .slice(component.indexOf('onChange={(e) => {'), component.indexOf('onBlur='))
    // The comment there explains why the clamp is absent; it is not one.
    .replace(/\/\*[\s\S]*?\*\//g, '')
  check('and it does not square the value up mid-keystroke',
    !/clampNumber\(|Math\.max\(|Math\.min\(/.test(onChange), onChange.replace(/\s+/g, ' ').slice(0, 70))
  check('it commits when the field is left', component.includes('onBlur={commit}'))
}

console.log(failures === 0
  ? '\nAll form checks passed.\n'
  : `\n${failures} form check${failures === 1 ? '' : 's'} failed.\n`)
process.exit(failures === 0 ? 0 : 1)
