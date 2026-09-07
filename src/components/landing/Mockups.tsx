import { useId } from 'react'
import { cx } from '../ui'

/* ------------------------------------------------------------------ *
 * What the product looks like
 *
 * Drawn rather than photographed: the same tokens, radii and type the
 * real screens use, so what somebody sees here is what they get. No
 * network, no image weight, and it follows the theme.
 *
 * The figures below are illustration. They are shaped like a portfolio
 * and belong to nobody — no name here exists in the test fixture, and
 * nothing in this file ever reaches the app's state. The product itself
 * still ships with no records at all, which is the point of check:nodata.
 * ------------------------------------------------------------------ */

/* --------------------------- primitives --------------------------- */

/** The chrome every preview sits in — a window, without pretending to be one. */
export function Frame({
  label, children, className,
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-hidden rounded-2xl border border-line bg-surface-card shadow-lift', className)}>
      <div className="flex items-center gap-2 border-b border-line bg-surface-inset/70 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-line-strong" />
          <span className="h-2 w-2 rounded-full bg-line-strong" />
          <span className="h-2 w-2 rounded-full bg-line-strong" />
        </span>
        <span className="ml-1 truncate text-[11.5px] font-medium text-ink-muted">{label}</span>
      </div>
      {children}
    </div>
  )
}

function Tile({
  label, value, note, tone = 'ink',
}: { label: string; value: string; note?: string; tone?: 'ink' | 'good' | 'gold' | 'critical' }) {
  const tones = {
    ink: 'text-ink',
    good: 'text-[rgb(var(--c-status-good))]',
    gold: 'text-gold-ink',
    critical: 'text-[rgb(var(--c-status-critical))]',
  }
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="truncate text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-muted">{label}</p>
      <p className={cx('tnum mt-1.5 text-[19px] font-semibold leading-none sm:text-[22px]', tones[tone])}>{value}</p>
      {note && <p className="mt-1.5 truncate text-[10.5px] text-ink-muted">{note}</p>}
    </div>
  )
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'good' | 'gold' | 'info' | 'critical' | 'muted' }) {
  const tones = {
    good: 'bg-[rgb(var(--c-status-good)/0.12)] text-[rgb(var(--c-status-good))]',
    gold: 'bg-gold-soft text-gold-ink',
    info: 'bg-[rgb(var(--c-status-info)/0.12)] text-[rgb(var(--c-status-info))]',
    critical: 'bg-[rgb(var(--c-status-critical)/0.12)] text-[rgb(var(--c-status-critical))]',
    muted: 'bg-surface-inset text-ink-muted',
  }
  return (
    <span className={cx('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-none', tones[tone])}>
      {children}
    </span>
  )
}

/* ---------------------------- the chart ---------------------------- */

const COLLECTED = [38, 44, 41, 52, 49, 61, 58, 67, 72, 69, 81, 88]
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** A catmull-rom-ish smooth path — the same shape the reports page draws. */
function smoothPath(values: number[], w: number, h: number, pad = 2) {
  const max = Math.max(...values) * 1.12
  const at = (i: number) => ({
    x: (i / (values.length - 1)) * (w - pad * 2) + pad,
    y: h - (values[i]! / max) * (h - pad * 2) - pad,
  })
  let d = ''
  for (let i = 0; i < values.length; i += 1) {
    const p = at(i)
    if (i === 0) { d += `M ${p.x} ${p.y}`; continue }
    const prev = at(i - 1)
    const cx1 = prev.x + (p.x - prev.x) / 2
    d += ` C ${cx1} ${prev.y} ${cx1} ${p.y} ${p.x} ${p.y}`
  }
  return d
}

function RevenueChart({ height = 96 }: { height?: number }) {
  const id = useId().replace(/:/g, '')
  const w = 320
  const line = smoothPath(COLLECTED, w, height)
  const area = `${line} L ${w - 2} ${height} L 2 ${height} Z`
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" role="img" aria-label="Collected rent, rising across twelve months">
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-2)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--viz-2)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={w} y1={height * f} y2={height * f} stroke="var(--viz-grid)" strokeWidth="1" />
        ))}
        <path d={area} fill={`url(#fill-${id})`} />
        <path d={line} fill="none" stroke="var(--viz-2)" strokeWidth="2" strokeLinecap="round" />
        <circle
          cx={w - 2}
          cy={height - (COLLECTED[11]! / (Math.max(...COLLECTED) * 1.12)) * (height - 4) - 2}
          r="3.5" fill="var(--viz-2)" stroke="var(--viz-surface)" strokeWidth="2"
        />
      </svg>
      <div className="mt-1.5 flex justify-between px-0.5 text-[9.5px] text-ink-muted" aria-hidden>
        {MONTHS.map((m, i) => <span key={i}>{m}</span>)}
      </div>
    </div>
  )
}

/* ------------------------ executive dashboard ---------------------- */

export function DashboardPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cx('grid gap-3 p-3.5 sm:p-4', compact && 'gap-2.5')}>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Tile label="Occupancy" value="94%" note="22 of 24 let" tone="good" />
        <Tile label="Collected" value="88.4M" note="this month, UGX" />
        <Tile label="Available" value="2" note="ready to let" tone="gold" />
        <Tile label="Due in 7 days" value="6" note="4.2M outstanding" tone="critical" />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-line bg-surface p-3.5 lg:col-span-3">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <p className="text-[11.5px] font-semibold text-ink">Collected rent</p>
            <p className="text-[10.5px] text-ink-muted">Last 12 months</p>
          </div>
          <RevenueChart />
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5 lg:col-span-2">
          <p className="mb-2.5 text-[11.5px] font-semibold text-ink">Upcoming payments</p>
          <ul className="space-y-2.5">
            {[
              ['Unit 4B · advance', 'in 2 days', 'gold'],
              ['Riverside 2A · rent', 'in 5 days', 'muted'],
              ['Garden Court · rent', 'in 9 days', 'muted'],
            ].map(([what, when, tone]) => (
              <li key={what} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11.5px] text-ink-secondary">{what}</span>
                <Pill tone={tone as 'gold' | 'muted'}>{when}</Pill>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-line pt-2.5">
            <p className="text-[10.5px] text-ink-muted">Reminders send themselves</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* -------------------------- availability --------------------------- */

/* Four units across three weeks. 0 free · 1 let · 2 reserved · 3 turnaround */
const CALENDAR = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 3, 0, 0, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1],
  [0, 0, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2],
]
const UNITS = ['Kololo 4B', 'Riverside 2A', 'Garden Court', 'Hillside 7']
const CELL = [
  'bg-surface-inset',
  'bg-[rgb(var(--c-status-info)/0.55)]',
  'bg-gold/60',
  'bg-[rgb(var(--c-status-serious)/0.5)]',
]
const CELL_LABEL = ['free', 'let', 'reserved', 'turnaround']

export function CalendarPreview() {
  return (
    <div className="p-3.5 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] font-semibold text-ink">Three weeks ahead</p>
        <div className="flex flex-wrap gap-2.5">
          {CELL_LABEL.map((label, i) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-[10px] text-ink-muted">
              <span className={cx('h-2 w-2 rounded-[3px]', CELL[i])} aria-hidden />{label}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {CALENDAR.map((row, r) => (
          <div key={UNITS[r]} className="flex items-center gap-2">
            <span className="w-[86px] shrink-0 truncate text-[10.5px] text-ink-secondary sm:w-[104px] sm:text-[11.5px]">{UNITS[r]}</span>
            <span className="flex min-w-0 flex-1 gap-[3px]" role="img" aria-label={`${UNITS[r]}: mostly ${CELL_LABEL[row[0]!]}`}>
              {row.map((v, c) => (
                <span key={c} className={cx('h-5 flex-1 rounded-[3px]', CELL[v])} />
              ))}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-line pt-2.5 text-[10.5px] text-ink-muted">
        A gap is a gap. Nothing is double-booked, because the agreement holds the unit.
      </p>
    </div>
  )
}

/* ------------------------- client profile -------------------------- */

export function ClientPreview() {
  return (
    <div className="p-3.5 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[13px] font-semibold text-[rgb(var(--c-text-onrail))]" aria-hidden>
          AM
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[13.5px] font-semibold text-ink">A. Mugisha</p>
            <Pill tone="good">Active</Pill>
            <Pill tone="muted">Tenant</Pill>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-ink-muted">In Kololo 4B since March · one home at a time</p>
        </div>
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-2.5">
        {[['Monthly rent', '2,500,000'], ['Paid through', '30 Nov'], ['Deposit held', '5,000,000'], ['Notice', '60 days']].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-surface px-3 py-2">
            <dt className="text-[10px] uppercase tracking-[0.09em] text-ink-muted">{k}</dt>
            <dd className="tnum mt-1 text-[12.5px] font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3.5 mb-2 text-[11px] font-semibold text-ink">Recent charges</p>
      <ul className="space-y-1.5">
        {[['Advance · 3 months', '7,500,000', 'good', 'Paid'],
          ['Refundable deposit', '5,000,000', 'good', 'Paid'],
          ['December rent', '2,500,000', 'gold', 'Due']].map(([what, amount, tone, status]) => (
          <li key={what} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2">
            <span className="min-w-0 truncate text-[11.5px] text-ink-secondary">{what}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tnum text-[11.5px] text-ink">{amount}</span>
              <Pill tone={tone as 'good' | 'gold'}>{status}</Pill>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------------- payments and reminders --------------------- */

export function PaymentsPreview() {
  const rows: Array<[string, string, string, 'good' | 'gold' | 'critical' | 'info']> = [
    ['ALT-INV-5012', 'Kololo 4B', 'Paid', 'good'],
    ['ALT-INV-5013', 'Riverside 2A', 'Due in 2 days', 'gold'],
    ['ALT-INV-5014', 'Garden Court', 'Overdue 4 days', 'critical'],
    ['ALT-INV-5015', 'Hillside 7', 'Upcoming', 'info'],
  ]
  return (
    <div className="p-3.5 sm:p-4">
      <div className="mb-3 grid grid-cols-3 gap-2.5">
        <Tile label="Collected" value="88.4M" tone="good" />
        <Tile label="Outstanding" value="4.2M" tone="critical" />
        <Tile label="Held on deposit" value="31.0M" />
      </div>
      <ul className="space-y-1.5">
        {rows.map(([number, where, status, tone]) => (
          <li key={number} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
            <span className="flex min-w-0 flex-col">
              <span className="tnum truncate text-[11.5px] font-medium text-ink">{number}</span>
              <span className="truncate text-[10.5px] text-ink-muted">{where}</span>
            </span>
            <Pill tone={tone}>{status}</Pill>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line pt-2.5 text-[10.5px] text-ink-muted">
        Every charge knows the period it pays for, so a quarterly advance is earned across its three months.
      </p>
    </div>
  )
}

/* --------------------------- team access --------------------------- */

const ROLES = ['Owner', 'Manager', 'Accountant', 'Staff'] as const
const ABILITIES = ['Properties', 'Payments', 'Team', 'Reports'] as const
const GRANTS: Record<typeof ROLES[number], boolean[]> = {
  Owner: [true, true, true, true],
  Manager: [true, true, false, true],
  Accountant: [false, true, false, true],
  Staff: [true, false, false, false],
}

export function TeamPreview() {
  return (
    <div className="p-3.5 sm:p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[11.5px] font-semibold text-ink">Who reaches what</p>
        <p className="text-[10.5px] text-ink-muted">7 of 10 seats</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line bg-surface-inset/60">
              <th scope="col" className="px-3 py-2 text-[10px] font-medium uppercase tracking-[0.09em] text-ink-muted">Role</th>
              {ABILITIES.map((a) => (
                <th key={a} scope="col" className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-[0.09em] text-ink-muted">{a}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--c-border))] bg-surface">
            {ROLES.map((role) => (
              <tr key={role}>
                <th scope="row" className="px-3 py-2 text-left text-[11.5px] font-medium text-ink">{role}</th>
                {GRANTS[role].map((on, i) => (
                  <td key={i} className="px-2 py-2 text-center">
                    <span
                      className={cx(
                        'inline-flex h-[15px] w-[15px] items-center justify-center rounded-[5px] border',
                        on ? 'border-gold bg-gold text-white' : 'border-line-strong bg-surface-card',
                      )}
                      role="img"
                      aria-label={`${role} ${on ? 'can' : 'cannot'} ${ABILITIES[i]}`}
                    >
                      {on && (
                        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
                          <path d="M2 6.4 4.6 9 10 3.2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10.5px] text-ink-muted">
        Tick a box and the database changes with it — the server refuses what the row says it should.
      </p>
    </div>
  )
}
