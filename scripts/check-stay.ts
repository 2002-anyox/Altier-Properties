/**
 * The bill follows the days actually spent.
 *
 * Run with `npm run check:stay`. Settlement is the kind of arithmetic
 * nobody notices is wrong until a guest disputes it at the desk, so every
 * case here is a real one somebody could walk in with: left early, stayed
 * on, turned up two days late, moved out and came back.
 *
 * The invariant underneath all of them is the one that matters most: once
 * a settlement is raised, the revenue recognised for the agreement equals
 * the value of the days actually occupied — no more, no less. That is
 * what makes a refund a refund rather than a number somebody typed.
 */
import { earnedInMonth, chargeSign } from '../src/lib/derive.js'
import { computeKpis } from '../src/lib/derive.js'
import { settleStay, stayWindow, valueOver, timeCharges, gapsIn, mergeWindows } from '../src/lib/stay.js'
import { settlementCharges } from '../src/lib/create.js'
import type { Booking, Invoice, Property } from '../src/lib/types.js'

const fail: string[] = []
let ran = 0
const ok = (cond: boolean, msg: string) => {
  ran++
  if (!cond) fail.push(msg)
}
const near = (a: number, b: number, msg: string, slack = 1) => {
  ran++
  if (Math.abs(a - b) > slack) fail.push(`${msg}: got ${Math.round(a)}, expected ${Math.round(b)}`)
}

/* ------------------------------ fixtures --------------------------- */

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b-1', reference: 'ALT-4001', propertyId: 'p-1', clientId: 'c-1',
  mode: 'short_stay', status: 'in_progress',
  start: '2026-01-10', end: '2026-01-17',
  rate: 200_000, deposit: 300_000, advanceMonths: 0, paidThrough: null,
  noticeDays: 0, guests: 2, source: 'direct',
  checkIn: '15:00', checkOut: '11:00',
  arrivedOn: '2026-01-10', departedOn: null,
  notes: '', createdAt: '2026-01-01',
  ...over,
})

let seq = 0
const charge = (over: Partial<Invoice> = {}): Invoice => ({
  id: `i-${++seq}`, number: `ALT-INV-${5000 + seq}`,
  propertyId: 'p-1', clientId: 'c-1', bookingId: 'b-1',
  type: 'booking', issuedOn: '2026-01-05', dueOn: '2026-01-10',
  amount: 1_400_000, earnsFrom: '2026-01-10', earnsTo: '2026-01-17',
  paidAmount: 0, status: 'pending', method: null, paidOn: null, memo: 'stay',
  ...over,
})

/* Every month a charge could touch, so recognition can be summed whole. */
const MONTHS: string[] = []
for (let y = 2025; y <= 2027; y++) {
  for (let m = 1; m <= 12; m++) MONTHS.push(`${y}-${String(m).padStart(2, '0')}`)
}
const recognised = (invoices: Invoice[]) =>
  MONTHS.reduce((a, k) => a + earnedInMonth(invoices, k), 0)

/* --------------------------- window arithmetic --------------------- */

{
  const w = stayWindow({ start: '2026-01-10', arrivedOn: '2026-01-10', departedOn: '2026-01-13' }, '2026-02-01')
  near(w.days, 3, 'ten to thirteen is three nights')

  const held = stayWindow({ start: '2026-01-10', arrivedOn: '2026-01-12', departedOn: '2026-01-17' }, '2026-02-01')
  ok(held.from === '2026-01-10', 'a late arrival still pays from the day the home came off the market')

  const earlyBird = stayWindow({ start: '2026-01-10', arrivedOn: '2026-01-08', departedOn: '2026-01-17' }, '2026-02-01')
  ok(earlyBird.from === '2026-01-08', 'somebody who turns up early is in residence from the day they turn up')

  const running = stayWindow({ start: '2026-01-10', arrivedOn: '2026-01-10', departedOn: null }, '2026-01-20')
  near(running.days, 10, 'still in residence counts to today')

  const sameDay = stayWindow({ start: '2026-01-10', arrivedOn: '2026-01-10', departedOn: '2026-01-10' }, '2026-01-10')
  near(sameDay.days, 0, 'in and out on one day is no nights')

  const backwards = stayWindow({ start: '2026-01-10', arrivedOn: '2026-01-10', departedOn: '2026-01-01' }, '2026-01-20')
  near(backwards.days, 0, 'a departure before the start is not a negative stay')
}

{
  const merged = mergeWindows([
    { from: '2026-01-01', to: '2026-02-01' },
    { from: '2026-02-01', to: '2026-03-01' },
    { from: '2026-01-15', to: '2026-01-20' },
  ])
  ok(merged.length === 1 && merged[0].from === '2026-01-01' && merged[0].to === '2026-03-01',
     `touching and overlapping windows merge into one, got ${JSON.stringify(merged)}`)

  const gaps = gapsIn(
    { from: '2026-01-01', to: '2026-04-01', days: 90 },
    [{ from: '2026-01-01', to: '2026-02-01' }, { from: '2026-03-01', to: '2026-04-01' }],
  )
  ok(gaps.length === 1 && gaps[0].from === '2026-02-01' && gaps[0].to === '2026-03-01',
     `a hole in the middle is found, got ${JSON.stringify(gaps)}`)
}

/* ------------------------- 1. left early, short stay --------------- */
{
  const b = booking({ departedOn: '2026-01-13' })
  const stay = charge()
  const s = settleStay(b, [stay], '2026-01-13')

  near(s.daysStayed, 3, 'stayed three nights of seven')
  near(s.daysBilled, 7, 'billed for seven')
  near(s.unusedDays, 4, 'four nights unused')
  near(s.credit, 800_000, 'four unused nights at 200,000 comes back')
  near(s.due, 0, 'nothing extra is owed by somebody who left early')
  ok(s.adjusts, 'an early departure is an adjustment')

  const raised = settlementCharges(b, [stay], '2026-01-13', [stay])
  ok(raised.length === 1 && raised[0].type === 'credit_note', 'one credit note is raised')
  ok(raised[0].bookingId === b.id, 'the credit note belongs to the agreement, as the schema insists')
  near(raised[0].amount, 800_000, 'the credit note carries the credit')
  ok(raised[0].amount > 0, 'the credit note is stored as a positive amount')
  ok(raised[0].number !== stay.number, 'the credit note takes the next free number')

  /* The invariant. Three nights were used, so three nights are earned. */
  near(recognised([stay, ...raised]), 600_000, 'after settling, only the nights slept are revenue')
  near(recognised([stay, ...raised]), valueOver([stay], s.stay), 'recognised equals the value of the days occupied')
}

/* --------------------- 2. paid in full, then left early ------------ */
{
  const b = booking({ departedOn: '2026-01-13' })
  const stay = charge({ paidAmount: 1_400_000, status: 'paid', paidOn: '2026-01-10', method: 'mobile_money' })
  const s = settleStay(b, [stay], '2026-01-13')
  near(s.outstanding, 0, 'a settled charge leaves nothing outstanding')
  near(s.balance, -800_000, 'money already taken for nights not used is owed back')
}

/* ------------------ 3. billed but unpaid, then left early ---------- */
{
  const b = booking({ departedOn: '2026-01-13' })
  const stay = charge()
  const s = settleStay(b, [stay], '2026-01-13')
  near(s.outstanding, 1_400_000, 'the whole stay is still owed before settling')
  near(s.balance, 600_000, 'settling reduces the debt rather than creating a refund')
}

/* ---------------------------- 4. overstayed ------------------------ */
{
  const b = booking({ departedOn: '2026-01-20' })
  const stay = charge()
  const s = settleStay(b, [stay], '2026-01-20')

  near(s.daysStayed, 10, 'ten nights in the building')
  near(s.extraDays, 3, 'three of them beyond what was billed')
  near(s.dailyRate, 200_000, 'the overstay continues the rate that was running')
  near(s.due, 600_000, 'three extra nights are charged')
  near(s.credit, 0, 'nothing is refunded to somebody who stayed longer')

  const raised = settlementCharges(b, [stay], '2026-01-20', [stay])
  ok(raised.length === 1 && raised[0].type === 'booking', 'the overstay is a further stay charge, not a credit')
  ok(raised[0].earnsFrom === '2026-01-17' && raised[0].earnsTo === '2026-01-20',
     `the extra charge earns over the days it covers, got ${raised[0].earnsFrom}..${raised[0].earnsTo}`)
  near(recognised([stay, ...raised]), 2_000_000, 'ten nights at 200,000 are recognised in total')
}

/* --------------------- 5. rental, quarter up front ----------------- */
{
  const b = booking({
    mode: 'rental', rate: 1_500_000, advanceMonths: 3,
    start: '2026-01-15', end: null, arrivedOn: '2026-01-15', departedOn: '2026-02-14',
  })
  const advance = charge({
    type: 'advance', amount: 4_500_000,
    earnsFrom: '2026-01-15', earnsTo: '2026-04-15',
    paidAmount: 4_500_000, status: 'paid', paidOn: '2026-01-15', method: 'bank_transfer',
    memo: '3-month advance',
  })
  const s = settleStay(b, [advance], '2026-02-14')

  near(s.daysBilled, 90, 'the advance buys ninety days')
  near(s.daysStayed, 30, 'thirty of them were lived in')
  near(s.dailyRate, 50_000, 'a day of the advance is worth 50,000')
  near(s.credit, 3_000_000, 'the sixty days nobody used come back')
  near(s.balance, -3_000_000, 'the tenant is owed the unused part of what they paid')

  const raised = settlementCharges(b, [advance], '2026-02-14', [advance])
  near(recognised([advance, ...raised]), 1_500_000, 'one month lived in is one month of revenue')

  /* And the reversal lands on the months it was recognised in, not on
     the month somebody happened to press the button. */
  near(earnedInMonth([advance, ...raised], '2026-03'), 0, 'a month never lived in earns nothing')
  ok(earnedInMonth([advance, ...raised], '2026-01') > 0, 'the month that was lived in keeps its revenue')
}

/* ----------------- 6. deposits and fees are never touched ---------- */
{
  const b = booking({ departedOn: '2026-01-13' })
  const stay = charge()
  const deposit = charge({ type: 'deposit', amount: 300_000, earnsFrom: '2026-01-10', earnsTo: '2026-02-10' })
  const water = charge({ type: 'utilities', amount: 45_000, earnsFrom: '2026-01-10', earnsTo: '2026-01-17' })

  const s = settleStay(b, [stay, deposit, water], '2026-01-13')
  near(s.credit, 800_000, 'only the nights are refunded — not the deposit, not the water')
  near(s.outstanding, 1_745_000, 'everything unpaid on the agreement is still counted as owed')

  const raised = settlementCharges(b, [stay, deposit, water], '2026-01-13', [stay, deposit, water])
  near(raised.reduce((a, i) => a + i.amount, 0), 800_000, 'the raised documents come to the same figure')
}

/* --------------------- 7. late arrival earns nothing --------------- */
{
  const b = booking({ arrivedOn: '2026-01-12', departedOn: '2026-01-17' })
  const s = settleStay(b, [charge()], '2026-01-17')
  near(s.credit, 0, 'a home held empty for a late guest is still a home that was let')
  ok(!s.adjusts, 'and there is nothing to adjust')
}

/* ------------------------ 8. ran its full course ------------------- */
{
  const b = booking({ departedOn: '2026-01-17' })
  const s = settleStay(b, [charge()], '2026-01-17')
  near(s.credit, 0, 'a stay that ran its course refunds nothing')
  near(s.due, 0, 'and charges nothing further')
  ok(!s.adjusts, 'so no documents are raised')
  ok(settlementCharges(b, [charge()], '2026-01-17', []).length === 0, 'literally none')
}

/* --------------------- 9. a gap in the middle of a term ------------ */
{
  const b = booking({
    mode: 'long_term', rate: 1_500_000,
    start: '2026-01-01', end: '2026-04-01',
    arrivedOn: '2026-01-01', departedOn: '2026-04-01',
  })
  const jan = charge({ type: 'rent', amount: 1_500_000, earnsFrom: '2026-01-01', earnsTo: '2026-02-01' })
  const mar = charge({ type: 'rent', amount: 1_500_000, earnsFrom: '2026-03-01', earnsTo: '2026-04-01' })
  const s = settleStay(b, [jan, mar], '2026-04-01')

  near(s.extraDays, 28, 'February was lived in and never billed')
  ok(s.due > 0, 'so February is charged')
  near(s.credit, 0, 'and nothing is refunded')

  const raised = settlementCharges(b, [jan, mar], '2026-04-01', [jan, mar])
  ok(raised.length === 1 && raised[0].earnsFrom === '2026-02-01' && raised[0].earnsTo === '2026-03-01',
     `the charge covers exactly the gap, got ${JSON.stringify(raised.map((r) => [r.earnsFrom, r.earnsTo]))}`)
}

/* ------------- 10. the ledger knows which way a credit counts ------ */
{
  const b = booking({ departedOn: '2026-01-13' })
  const stay = charge({ paidAmount: 1_400_000, status: 'paid', paidOn: '2026-01-10', method: 'card' })
  const [credit] = settlementCharges(b, [stay], '2026-01-13', [stay])

  ok(chargeSign('credit_note') === -1, 'a credit note counts backwards')
  ok(chargeSign('rent') === 1 && chargeSign('deposit') === 1, 'everything else counts forwards')

  const property: Property = {
    id: 'p-1', code: 'ALT-P-001', name: 'Kololo two-bed', type: 'apartment',
    mode: 'short_stay', status: 'available',
    address: { line1: '', district: '', city: '', country: 'Uganda', x: 0.5, y: 0.5, lat: null, lng: null },
    bedrooms: 2, bathrooms: 1, sizeSqm: 80, amenities: [], price: 200_000, currency: 'UGX',
    managerId: 'm-1', rating: 4.5, availableFrom: null, acquiredOn: '2025-01-01',
    yieldPct: 8, notes: '', photoSeed: 1, documents: [], occupancyHistory: [], maintenanceNotes: [],
  }

  /* An unpaid credit note is money we owe. It has no business swelling
     the overdue pile that somebody chases clients over. */
  const overdueCredit: Invoice = { ...credit, status: 'overdue', dueOn: '2025-12-01' }
  const k = computeKpis([property], [overdueCredit], [], [], [])
  near(k.overdueAmount, 0, 'a refund we owe is not an overdue receivable')
  ok(k.overdueCount === 0, 'and it is not counted as one either')
}

/* ------------------ 11. numbering never collides ------------------- */
{
  const b = booking({ departedOn: '2026-01-13' })
  const stay = charge({ number: 'ALT-INV-5099' })
  const raised = settlementCharges(b, [stay], '2026-01-13', [stay])
  ok(raised.every((r) => r.number > 'ALT-INV-5099'),
     `settlement numbering continues past the ledger, got ${raised.map((r) => r.number).join(', ')}`)
  ok(new Set(raised.map((r) => r.id)).size === raised.length, 'every raised document has its own id')
}

/* ---------- 12. both directions at once, on one agreement ---------- */
{
  const b = booking({
    mode: 'rental', rate: 1_500_000,
    start: '2026-01-01', end: null, arrivedOn: '2026-01-01', departedOn: '2026-05-01',
  })
  /* Paid January and February, then February's charge was for March too,
     and they stayed through April with nothing covering it. */
  const janFeb = charge({ type: 'advance', amount: 3_000_000, earnsFrom: '2026-01-01', earnsTo: '2026-03-01' })
  const jun = charge({ type: 'rent', amount: 1_500_000, earnsFrom: '2026-06-01', earnsTo: '2026-07-01' })
  const s = settleStay(b, [janFeb, jun], '2026-05-01')

  ok(s.credit > 0, 'June was paid for and never lived in')
  ok(s.due > 0, 'March and April were lived in and never billed')
  const raised = settlementCharges(b, [janFeb, jun], '2026-05-01', [janFeb, jun])
  ok(raised.some((r) => r.type === 'credit_note') && raised.some((r) => r.type !== 'credit_note'),
     'both a credit and a charge are raised, and neither is netted away first')
  near(
    recognised([janFeb, jun, ...raised]),
    valueOver(timeCharges([janFeb, jun], b.id), s.stay) + s.due,
    'what is recognised is what the occupied days are worth',
  )
}

/* -------- 13. the screen and the documents agree to the shilling ---- */
{
  /* Three separate unused stretches, each rounding on its own. If the
     settlement rounded the total instead, the figure somebody agreed to
     at the desk would sit a shilling away from the credit note it
     produced — and a shilling is enough to make somebody wonder what
     else about the number is approximate. */
  const b = booking({
    mode: 'long_term', rate: 1_000_000,
    start: '2026-01-01', end: '2026-07-01',
    arrivedOn: '2026-01-01', departedOn: '2026-02-10',
  })
  const odd = [
    charge({ type: 'rent', amount: 999_999, earnsFrom: '2026-01-01', earnsTo: '2026-02-01' }),
    charge({ type: 'rent', amount: 1_000_001, earnsFrom: '2026-03-01', earnsTo: '2026-04-01' }),
    charge({ type: 'rent', amount: 333_333, earnsFrom: '2026-05-01', earnsTo: '2026-06-01' }),
  ]
  const s = settleStay(b, odd, '2026-02-10')
  const raised = settlementCharges(b, odd, '2026-02-10', odd)
  const raisedCredit = raised.filter((r) => r.type === 'credit_note').reduce((a, r) => a + r.amount, 0)
  const raisedDue = raised.filter((r) => r.type !== 'credit_note').reduce((a, r) => a + r.amount, 0)
  ok(raisedCredit === s.credit, `the credit shown is the credit raised (${s.credit} vs ${raisedCredit})`)
  ok(raisedDue === s.due, `and the charge shown is the charge raised (${s.due} vs ${raisedDue})`)
  ok(raised.filter((r) => r.type === 'credit_note').length >= 2,
     `several unused stretches each get their own note (${raised.length} raised)`)
}

/* ------------------- 14. a charge with no length ------------------- */
{
  const b = booking({ departedOn: '2026-01-13' })
  const broken = charge({ earnsFrom: '2026-01-10', earnsTo: '2026-01-10' })
  const s = settleStay(b, [broken], '2026-01-13')
  ok(Number.isFinite(s.credit) && Number.isFinite(s.due), 'a zero-length charge does not divide by zero')
}

if (fail.length) {
  console.error(`FAILURES (${fail.length} of ${ran}):\n  ` + fail.join('\n  '))
  process.exit(1)
}
console.log(`ALL CHECKS PASS — ${ran} assertions about days, money and the arithmetic between them`)
