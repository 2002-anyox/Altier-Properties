/* ------------------------------------------------------------------ *
 * Round-trip verification
 *
 * Migrates, seeds, then reads the portfolio back out and checks the
 * numbers still agree with the generator the UI runs on. A schema can
 * lose a row, round a figure or drop a null and still look healthy —
 * this compares the two sides to the shilling.
 *
 * Run with `npm run db:check`.
 * ------------------------------------------------------------------ */

import { sql } from 'drizzle-orm'
import { INVOICES, TODAY, iso } from '../../src/lib/data.ts'
import { chargeClass, deferredPortion, earnedInMonth } from '../../src/lib/derive.ts'
import type { Invoice } from '../../src/lib/types.ts'
import { MEMORY, connect } from './client.ts'
import { readPortfolio } from './read.ts'
import * as t from './schema.ts'
import { seed } from './seed.ts'

const fail: string[] = []
const ok = (cond: boolean, msg: string) => { if (!cond) fail.push(msg) }
const money = (n: number) => new Intl.NumberFormat('en-UG').format(Math.round(n))

const shift = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/* The check owns its database from scratch every run, so without a real
   Postgres behind it PGlite stays in memory rather than touching .pglite. */
process.env.PGLITE_PATH ??= MEMORY

const { db, driver, migrate, close } = await connect()
console.log(`verifying via ${driver}${driver === 'pglite' ? ' (in memory)' : ''}`)
await migrate()
await seed(db)

/* 1. Nothing was dropped on the way in. */
const rows = await db.select().from(t.invoices)
ok(rows.length === INVOICES.length,
   `invoice count: ${rows.length} in database, ${INVOICES.length} generated`)
console.log(`row check: ${rows.length} invoices`)

/* 2. No figure was rounded or truncated by a column type. */
const sumOf = (xs: Array<{ amount: number; paidAmount: number }>) => ({
  amount: xs.reduce((a, x) => a + x.amount, 0),
  paid: xs.reduce((a, x) => a + x.paidAmount, 0),
})
const dbTotals = sumOf(rows)
const memTotals = sumOf(INVOICES)
ok(dbTotals.amount === memTotals.amount,
   `billed total: ${money(dbTotals.amount)} in database, ${money(memTotals.amount)} generated`)
ok(dbTotals.paid === memTotals.paid,
   `collected total: ${money(dbTotals.paid)} in database, ${money(memTotals.paid)} generated`)
console.log(`total check: billed ${money(dbTotals.amount)}, collected ${money(dbTotals.paid)}`)

/* 3. Revenue recognition agrees month by month — the figure the dashboard
      leads with, computed from database rows rather than memory. */
const asInvoices = rows as unknown as Invoice[]
const base = iso(TODAY).slice(0, 7)
let worst = 0
for (let m = -11; m <= 0; m++) {
  const key = shift(base, m)
  const fromDb = earnedInMonth(asInvoices, key)
  const fromMemory = earnedInMonth(INVOICES, key)
  worst = Math.max(worst, Math.abs(fromDb - fromMemory))
  ok(Math.abs(fromDb - fromMemory) < 1,
     `earned ${key}: ${money(fromDb)} from database, ${money(fromMemory)} generated`)
}
console.log(`recognition check: 12 months, worst difference ${money(worst)}`)

/* 4. Nulls survived. An open-ended rental has no end date, and losing that
      would silently turn it into a fixed-term lease. */
const openEnded = rows.length && await db.select({ n: sql<number>`count(*)::int` })
  .from(t.bookings).where(sql`${t.bookings.endsOn} IS NULL`)
const openEndedDb = Number(openEnded ? openEnded[0].n : 0)
const openEndedMem = (await import('../../src/lib/data.ts')).BOOKINGS.filter((b) => b.end === null).length
ok(openEndedDb === openEndedMem,
   `open-ended rentals: ${openEndedDb} in database, ${openEndedMem} generated`)
ok(openEndedDb > 0, 'no open-ended rentals survived the round trip')
console.log(`null check: ${openEndedDb} open-ended rentals`)

/* 5. Deferred revenue is unchanged, so advances still split from earnings. */
const deferredDb = asInvoices.reduce((a, i) => a + deferredPortion(i), 0)
const deferredMem = INVOICES.reduce((a, i) => a + deferredPortion(i), 0)
ok(Math.abs(deferredDb - deferredMem) < 1,
   `deferred: ${money(deferredDb)} from database, ${money(deferredMem)} generated`)
console.log(`deferred check: ${money(deferredDb)} held in advance`)

/* 6. Deposits are still identifiable, so they stay out of revenue. */
const depositsDb = asInvoices.filter((i) => chargeClass(i.type) === 'deposit').length
ok(depositsDb === INVOICES.filter((i) => chargeClass(i.type) === 'deposit').length,
   'deposit rows changed across the round trip')
console.log(`deposit check: ${depositsDb} deposits`)

/* 7. Every client-property link points at rows that exist. Foreign keys
      guarantee this, so a failure here means the constraint is missing. */
const orphans = await db.execute(sql`
  SELECT count(*)::int AS n FROM ${t.clientProperties} cp
  LEFT JOIN ${t.properties} p ON p.id = cp.property_id
  LEFT JOIN ${t.clients} c ON c.id = cp.client_id
  WHERE p.id IS NULL OR c.id IS NULL
`)
const orphanCount = Number((orphans.rows ?? orphans)[0]?.n ?? 0)
ok(orphanCount === 0, `${orphanCount} orphaned client-property links`)
console.log(`integrity check: ${orphanCount} orphaned links`)

/* 8. The constraints actually reject. Valid data passing proves nothing
      about enforcement — each of these must be refused by the database. */
const sample = rows[0]
const rejects = async (label: string, row: Record<string, unknown>) => {
  try {
    await db.insert(t.invoices).values({ ...sample, id: `probe-${label}`, number: `PROBE-${label}`, ...row } as any)
    fail.push(`constraint did not reject: ${label}`)
    await db.delete(t.invoices).where(sql`${t.invoices.id} = ${`probe-${label}`}`)
  } catch {
    /* rejected, as it should be */
  }
}
/* Control: an otherwise-identical row with nothing wrong must be accepted.
   Without this, every probe above could be failing on a duplicate key or a
   bad column name and the checks would pass while proving nothing. */
try {
  await db.insert(t.invoices).values({ ...sample, id: 'probe-control', number: 'PROBE-CONTROL' } as any)
  await db.delete(t.invoices).where(sql`${t.invoices.id} = 'probe-control'`)
} catch (e) {
  fail.push(`control row was rejected, so the probes below prove nothing: ${(e as Error).message}`)
}

await rejects('earns-backwards', { earnsFrom: '2026-06-01', earnsTo: '2026-05-01' })
await rejects('overpaid', { amount: 1000, paidAmount: 5000, paidOn: '2026-06-01' })
await rejects('paid-without-date', { amount: 1000, paidAmount: 1000, paidOn: null })
await rejects('dated-without-payment', { amount: 1000, paidAmount: 0, paidOn: '2026-06-01' })

const badBooking = async () => {
  const b = (await db.select().from(t.bookings).limit(1))[0]
  try {
    await db.insert(t.bookings).values({
      ...b, id: 'probe-open-lease', reference: 'PROBE-LSE',
      mode: 'long_term', endsOn: null,
    } as any)
    fail.push('constraint did not reject: open-ended fixed-term lease')
  } catch { /* rejected */ }
}
await badBooking()
console.log(`constraint check: 5 invalid rows offered, all refused`)

/* 9. The reader is the exact inverse of the seeder. A mis-mapped column
      would not fail any constraint — it would just quietly show the wrong
      thing on every page — so compare what comes back to what went in. */
const portfolio = await readPortfolio(db)
const data = await import('../../src/lib/data.ts')

/** Order is cosmetic for these, so compare them as sets. */
const normalise = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalise)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = (k === 'amenities' || k === 'propertyIds')
        ? [...(v as string[])].sort()
        : normalise(v)
    }
    return out
  }
  return value
}

const diff = (a: unknown, b: unknown, path = ''): string | null => {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: ${a.length} vs ${b.length} items`
    for (let i = 0; i < a.length; i++) {
      const d = diff(a[i], b[i], `${path}[${i}]`)
      if (d) return d
    }
    return null
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      const d = diff((a as any)[k], (b as any)[k], path ? `${path}.${k}` : k)
      if (d) return d
    }
    return null
  }
  return Object.is(a, b) ? null : `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`
}

for (const [name, fromDb, fromMemory] of [
  ['properties', portfolio.properties, data.PROPERTIES],
  ['clients', portfolio.clients, data.CLIENTS],
  ['bookings', portfolio.bookings, data.BOOKINGS],
  ['invoices', portfolio.invoices, data.INVOICES],
  ['maintenance', portfolio.maintenance, data.MAINTENANCE],
  ['team', portfolio.team, data.TEAM],
] as const) {
  const sortById = (xs: readonly any[]) => [...xs].sort((x, y) => (x.id < y.id ? -1 : 1))
  const d = diff(normalise(sortById(fromDb)), normalise(sortById(fromMemory)))
  ok(!d, `${name} differ after the round trip — ${d}`)
}
const rd = diff(normalise(portfolio.reminders), normalise(data.DEFAULT_REMINDERS))
ok(!rd, `reminder settings differ after the round trip — ${rd}`)
console.log(`reader check: 6 collections + settings identical to the generator`)

await close()

if (fail.length) {
  console.error('FAILURES:\n  ' + fail.join('\n  '))
  process.exit(1)
}
console.log('ROUND TRIP CLEAN')
