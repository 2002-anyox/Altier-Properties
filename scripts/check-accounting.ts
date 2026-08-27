/**
 * Accounting invariants for revenue recognition.
 *
 * Run with `npm run check:accounting`. These rules are easy to break
 * silently — a charge recognised twice, or a deposit leaking into revenue,
 * looks like ordinary growth on a chart.
 */
import { INVOICES, TODAY, iso } from '../src/lib/data.js'
import { chargeClass, deferredPortion, earnedInMonth } from '../src/lib/derive.js'

const fail: string[] = []
const ok = (cond: boolean, msg: string) => { if (!cond) fail.push(msg) }

const shift = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 1. Every non-deposit charge must be fully recognised, no more and no less.
const base = iso(TODAY).slice(0, 7)
const keys: string[] = []
for (let m = -40; m <= 40; m++) keys.push(shift(base, m))

let checked = 0
for (const inv of INVOICES) {
  if (chargeClass(inv.type) === 'deposit') continue
  const total = keys.reduce((a, k) => a + earnedInMonth([inv], k), 0)
  if (Math.abs(total - inv.amount) > 1) {
    fail.push(`${inv.number} recognised ${Math.round(total)} of ${inv.amount}`)
    if (fail.length > 4) break
  }
  checked++
}
console.log(`fully-recognised check: ${checked} charges`)

// 2. Deposits are never recognised and never deferred.
const deposits = INVOICES.filter((i) => chargeClass(i.type) === 'deposit')
const depEarned = keys.reduce((a, k) => a + earnedInMonth(deposits, k), 0)
ok(depEarned === 0, `deposits recognised ${depEarned}, expected 0`)
ok(deposits.every((d) => deferredPortion(d) === 0), 'a deposit was treated as deferred revenue')
console.log(`deposit check: ${deposits.length} deposits, earned ${depEarned}`)

// 3. A stay straddling a month boundary splits by nights, not by invoice date.
const straddling = INVOICES.filter(
  (i) => i.type === 'booking' && i.earnsFrom.slice(0, 7) !== i.earnsTo.slice(0, 7),
)
ok(straddling.length > 0, 'no month-straddling stays in the sample')
for (const inv of straddling.slice(0, 6)) {
  const firstKey = inv.earnsFrom.slice(0, 7)
  const nights = (new Date(inv.earnsTo + 'T00:00:00').getTime() - new Date(inv.earnsFrom + 'T00:00:00').getTime()) / 86400000
  const nightsInFirst = (new Date(shift(firstKey, 1) + '-01T00:00:00').getTime() - new Date(inv.earnsFrom + 'T00:00:00').getTime()) / 86400000
  const expected = inv.amount * (nightsInFirst / nights)
  const actual = earnedInMonth([inv], firstKey)
  ok(Math.abs(actual - expected) < 1,
     `${inv.number} first month ${Math.round(actual)} vs expected ${Math.round(expected)}`)
}
console.log(`straddle check: ${straddling.length} stays cross a month boundary`)

// 4. Deferred never exceeds what was actually paid.
for (const inv of INVOICES) {
  ok(deferredPortion(inv) <= inv.paidAmount + 1, `${inv.number} deferred exceeds paid`)
}

// 5. A quarterly advance spreads across three months, not one.
const cycles = INVOICES.filter((i) => i.type === 'advance')
ok(cycles.length > 0, 'no advance cycles generated')
for (const inv of cycles.slice(0, 5)) {
  const k = inv.earnsFrom.slice(0, 7)
  const inFirst = earnedInMonth([inv], k)
  ok(inFirst < inv.amount * 0.9, `${inv.number} recognised ${Math.round(inFirst)} of ${inv.amount} in its first month`)
}
console.log(`advance check: ${cycles.length} cycle charges`)

if (fail.length) {
  console.error('FAILURES:\n  ' + fail.join('\n  '))
  process.exit(1)
}
console.log('ALL CHECKS PASS')
