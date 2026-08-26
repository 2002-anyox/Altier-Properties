import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  CalendarDays, CalendarRange, ChevronLeft, ChevronRight, DoorOpen, LayoutList, Rows3,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import {
  Button, Card, CardHeader, Chip, EmptyState, IconButton, PROPERTY_STATUS_META, SearchInput,
  SegmentedControl, Select, StatusChip, cx,
} from '../components/ui'
import { useStore } from '../lib/store'
import { TODAY, addDays, daysBetween, iso } from '../lib/data'
import { mediumDate, money, relativeDay, shortDate } from '../lib/format'
import { buildMonthGrid, endOf, isOpenEnded, upcomingAvailability } from '../lib/derive'
import { itemVariants, listVariants } from '../lib/motion'
import type { Booking, Property, TenancyMode } from '../lib/types'

type View = 'timeline' | 'month' | 'list'

const DAYS_SHOWN = 35

export default function Availability() {
  const { state } = useStore()
  const [view, setView] = useState<View>('timeline')
  const [offset, setOffset] = useState(0)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'all' | TenancyMode>('all')

  const start = useMemo(() => addDays(TODAY, offset * 14), [offset])
  const days = useMemo(
    () => Array.from({ length: DAYS_SHOWN }, (_, i) => {
      const d = addDays(start, i)
      return { iso: iso(d), date: d, isToday: iso(d) === iso(TODAY), weekend: [0, 6].includes(d.getDay()) }
    }),
    [start],
  )

  const properties = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.properties.filter((p) => {
      if (mode !== 'all' && p.mode !== mode) return false
      if (!q) return true
      return `${p.name} ${p.address.district} ${p.code}`.toLowerCase().includes(q)
    })
  }, [state.properties, query, mode])

  const freeingUp = useMemo(() => upcomingAvailability(state.properties, 60), [state.properties])
  const availableNow = state.properties.filter((p) => p.status === 'available')

  const rangeLabel = `${shortDate(days[0].iso)} – ${shortDate(days[days.length - 1].iso)}`

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Availability"
        description="One timeline for the whole portfolio. Leases and open-ended rentals run as continuous bars, short stays as blocks — the same grid, whatever the letting model."
        actions={
          <SegmentedControl<View>
            ariaLabel="Change availability view"
            value={view}
            onChange={setView}
            options={[
              { value: 'timeline', label: <span className="inline-flex items-center gap-1.5"><Rows3 size={14} /><span className="hidden sm:inline">Timeline</span></span> },
              { value: 'month', label: <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /><span className="hidden sm:inline">Month</span></span> },
              { value: 'list', label: <span className="inline-flex items-center gap-1.5"><LayoutList size={14} /><span className="hidden sm:inline">List</span></span> },
            ]}
          />
        }
      />

      <motion.div variants={listVariants} initial="initial" animate="animate" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div variants={itemVariants}><Tile label="Available now" value={availableNow.length} tone="good" hint="ready to let" /></motion.div>
        <motion.div variants={itemVariants}><Tile label="Occupied" value={state.properties.filter((p) => p.status === 'occupied').length} tone="info" hint="currently let" /></motion.div>
        <motion.div variants={itemVariants}><Tile label="Reserved" value={state.properties.filter((p) => p.status === 'reserved').length} tone="gold" hint="awaiting move-in" /></motion.div>
        <motion.div variants={itemVariants}><Tile label="Freeing up in 60 days" value={freeingUp.length} tone="default" hint="plan re-marketing" /></motion.div>
      </motion.div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Filter properties…" className="min-w-[200px] flex-1" />
        <Select value={mode} onChange={(e) => setMode(e.target.value as any)} aria-label="Filter by letting model" className="w-auto min-w-[160px]">
          <option value="all">All letting models</option>
          <option value="long_term">Fixed-term leases</option>
          <option value="rental">Open-ended rentals</option>
          <option value="short_stay">Short stays</option>
        </Select>
        {view === 'timeline' && (
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-card p-1">
            <IconButton label="Previous fortnight" onClick={() => setOffset((o) => o - 1)}><ChevronLeft size={16} /></IconButton>
            <span className="tnum px-2 text-[12.5px] font-medium text-ink-secondary">{rangeLabel}</span>
            <IconButton label="Next fortnight" onClick={() => setOffset((o) => o + 1)}><ChevronRight size={16} /></IconButton>
            {offset !== 0 && <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>Today</Button>}
          </div>
        )}
      </div>

      {view === 'timeline' && <Timeline properties={properties} bookings={state.bookings} days={days} />}
      {view === 'month' && <MonthView properties={state.properties} bookings={state.bookings} />}
      {view === 'list' && <ListView properties={properties} freeingUp={freeingUp} />}
    </>
  )
}

function Tile({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: 'good' | 'info' | 'gold' | 'default' }) {
  const bars = { good: 'bg-status-good', info: 'bg-status-info', gold: 'bg-gold', default: 'bg-line-strong' }
  return (
    <div className="card card-pad relative overflow-hidden">
      <span className={cx('absolute inset-y-0 left-0 w-[3px]', bars[tone])} aria-hidden />
      <p className="text-[12.5px] font-medium text-ink-secondary">{label}</p>
      <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{value}</p>
      <p className="mt-2 text-[12px] text-ink-muted">{hint}</p>
    </div>
  )
}

function Timeline({ properties, bookings, days }: { properties: Property[]; bookings: Booking[]; days: Array<{ iso: string; date: Date; isToday: boolean; weekend: boolean }> }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const colWidth = 34
  const gridWidth = days.length * colWidth

  if (properties.length === 0) {
    return <Card><EmptyState icon={<CalendarRange size={22} />} title="No properties match" body="Adjust the search or letting-model filter to bring properties back into the timeline." /></Card>
  }

  return (
    <Card className="overflow-hidden">
      <div className="scroll-x">
        <div style={{ minWidth: gridWidth + 232 }}>
          {/* header */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-surface-card">
            <div className="sticky left-0 z-30 w-[232px] shrink-0 border-r border-line bg-surface-card px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Property</p>
            </div>
            <div className="flex" style={{ width: gridWidth }}>
              {days.map((d) => (
                <div
                  key={d.iso}
                  className={cx('shrink-0 border-r border-line/60 py-2 text-center last:border-r-0', d.weekend && 'bg-surface-inset/50')}
                  style={{ width: colWidth }}
                >
                  <p className={cx('text-[9.5px] uppercase tracking-wider', d.isToday ? 'text-gold' : 'text-ink-muted')}>
                    {d.date.toLocaleDateString('en-GB', { weekday: 'narrow' })}
                  </p>
                  <p className={cx('tnum mt-0.5 text-[12px] font-medium', d.isToday ? 'text-gold' : 'text-ink-secondary')}>{d.date.getDate()}</p>
                </div>
              ))}
            </div>
          </div>

          {/* rows */}
          <div className="relative">
            {properties.map((p) => {
              const rows = bookings.filter((b) => b.propertyId === p.id && b.status !== 'cancelled' && b.start <= days[days.length - 1].iso && endOf(b) >= days[0].iso)
              return (
                <div key={p.id} className="flex border-b border-line last:border-b-0">
                  <div className="sticky left-0 z-10 flex w-[232px] shrink-0 items-center gap-2.5 border-r border-line bg-surface-card px-4 py-2.5">
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', PROPERTY_STATUS_META[p.status].dot)} aria-hidden />
                    <Link to={`/properties/${p.id}`} className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-ink hover:text-gold">{p.name}</span>
                      <span className="block truncate text-[10.5px] text-ink-muted">{p.address.district}</span>
                    </Link>
                  </div>
                  <div className="relative" style={{ width: gridWidth, height: 46 }}>
                    {days.map((d, i) => (
                      <div
                        key={d.iso}
                        className={cx('absolute inset-y-0 border-r border-line/50', d.weekend && 'bg-surface-inset/40', d.isToday && 'bg-gold/[0.06]')}
                        style={{ left: i * colWidth, width: colWidth }}
                      />
                    ))}
                    {rows.map((b) => {
                      const from = Math.max(0, daysBetween(days[0].iso, b.start))
                      const openEnded = isOpenEnded(b)
                      const to = openEnded ? days.length : Math.min(days.length, daysBetween(days[0].iso, b.end ?? days[0].iso))
                      const width = Math.max(colWidth * 0.7, (to - from) * colWidth - 4)
                      const isShort = b.mode === 'short_stay'
                      return (
                        <motion.div
                          key={b.id}
                          initial={{ opacity: 0, scaleX: 0.9 }}
                          animate={{ opacity: 1, scaleX: 1 }}
                          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          style={{ left: from * colWidth + 2, width, transformOrigin: 'left' }}
                          className={cx(
                            'absolute top-[9px] flex h-7 items-center overflow-hidden px-2 text-[11px] font-medium shadow-sm transition-transform duration-200 hover:z-10 hover:scale-[1.02]',
                            /* An open-ended rental has no right-hand edge to draw. */
                            openEnded ? 'rounded-l-lg rounded-r-none' : 'rounded-lg',
                            b.status === 'upcoming'
                              ? 'bg-gold-soft text-gold-ink ring-1 ring-gold/40'
                              : isShort
                                ? 'bg-[rgb(var(--c-status-info)/0.16)] text-[rgb(var(--c-status-info))] ring-1 ring-[rgb(var(--c-status-info)/0.35)]'
                                : openEnded
                                  ? 'bg-gold text-white dark:text-navy-950'
                                  : 'bg-navy-900 text-white dark:bg-navy-700',
                          )}
                          onMouseEnter={() => setHovered(b.id)}
                          onMouseLeave={() => setHovered(null)}
                          title={`${b.reference} · ${shortDate(b.start)} – ${openEnded ? 'open-ended' : shortDate(b.end ?? b.start)}`}
                        >
                          <span className="truncate">{isShort ? 'Stay' : openEnded ? 'Rental' : 'Lease'} · {b.reference}</span>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-5 py-3">
        <Legend className="bg-navy-900 dark:bg-navy-700" label="Fixed-term lease" />
        <Legend className="bg-gold rounded-r-none" label="Open-ended rental (runs until notice)" />
        <Legend className="bg-[rgb(var(--c-status-info)/0.4)]" label="Short stay" />
        <Legend className="bg-gold-soft ring-1 ring-gold/40" label="Confirmed, not started" />
        <Legend className="bg-gold/20" label="Today" />
      </div>
    </Card>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11.5px] text-ink-secondary">
      <span className={cx('h-3 w-6 rounded', className)} aria-hidden />
      {label}
    </span>
  )
}

function MonthView({ properties, bookings }: { properties: Property[]; bookings: Booking[] }) {
  const [anchor, setAnchor] = useState(() => new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))
  const grid = useMemo(() => buildMonthGrid(anchor), [anchor])
  const [selected, setSelected] = useState<string | null>(iso(TODAY))

  const byDay = useMemo(() => {
    const map = new Map<string, { in: Booking[]; out: Booking[]; occupied: number }>()
    grid.forEach((g) => {
      const ins = bookings.filter((b) => b.status !== 'cancelled' && b.start === g.date)
      const outs = bookings.filter((b) => b.status !== 'cancelled' && b.end !== null && b.end === g.date)
      const occupied = bookings.filter((b) => b.status !== 'cancelled' && b.start <= g.date && endOf(b) > g.date).length
      map.set(g.date, { in: ins, out: outs, occupied })
    })
    return map
  }, [grid, bookings])

  const selectedData = selected ? byDay.get(selected) : undefined

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
          <h3 className="font-display text-[17px] font-semibold text-ink">
            {anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </h3>
          <div className="flex items-center gap-1">
            <IconButton label="Previous month" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}><ChevronLeft size={16} /></IconButton>
            <IconButton label="Next month" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}><ChevronRight size={16} /></IconButton>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 border-t border-line">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="border-b border-line px-2 py-2 text-center text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{d}</div>
          ))}
          {grid.map((g) => {
            const data = byDay.get(g.date)!
            const isSelected = selected === g.date
            return (
              <button
                key={g.date}
                onClick={() => setSelected(g.date)}
                className={cx(
                  'relative min-h-[74px] border-b border-r border-line p-1.5 text-left transition-colors last:border-r-0 sm:min-h-[92px]',
                  !g.inMonth && 'bg-surface-inset/40',
                  g.isWeekend && g.inMonth && 'bg-surface-inset/25',
                  isSelected ? 'ring-2 ring-inset ring-gold' : 'hover:bg-surface-inset/70',
                )}
              >
                <span className={cx('tnum inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-medium', g.isToday ? 'bg-gold text-white dark:text-navy-950' : g.inMonth ? 'text-ink' : 'text-ink-muted/60')}>
                  {g.day}
                </span>
                {g.inMonth && (
                  <span className="mt-1 flex flex-col gap-1">
                    {data.in.length > 0 && (
                      <span className="truncate rounded bg-[rgb(var(--c-status-good)/0.14)] px-1 py-0.5 text-[9.5px] font-medium text-[rgb(var(--c-status-good))]">
                        {data.in.length} in
                      </span>
                    )}
                    {data.out.length > 0 && (
                      <span className="truncate rounded bg-surface-inset px-1 py-0.5 text-[9.5px] font-medium text-ink-secondary">
                        {data.out.length} out
                      </span>
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </Card>

      <Card className="flex flex-col">
        <CardHeader
          title={selected ? mediumDate(selected) : 'Select a day'}
          subtitle={selectedData ? `${selectedData.occupied} properties occupied` : undefined}
        />
        <div className="mt-3 flex-1">
          {!selectedData || (selectedData.in.length === 0 && selectedData.out.length === 0) ? (
            <EmptyState icon={<CalendarDays size={20} />} title="No movements" body="No arrivals or departures are scheduled on this date. Occupied properties continue as normal." />
          ) : (
            <ul className="divide-y divide-[rgb(var(--c-border))]">
              {selectedData.in.map((b) => <MovementRow key={`in-${b.id}`} booking={b} kind="in" properties={properties} />)}
              {selectedData.out.map((b) => <MovementRow key={`out-${b.id}`} booking={b} kind="out" properties={properties} />)}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}

function MovementRow({ booking, kind, properties }: { booking: Booking; kind: 'in' | 'out'; properties: Property[] }) {
  const { state } = useStore()
  const p = properties.find((x) => x.id === booking.propertyId)
  const c = state.clients.find((x) => x.id === booking.clientId)
  return (
    <li className="flex items-center gap-3 px-5 py-3 sm:px-6">
      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', kind === 'in' ? 'bg-[rgb(var(--c-status-good)/0.12)] text-[rgb(var(--c-status-good))]' : 'bg-surface-inset text-ink-secondary')} aria-hidden>
        <DoorOpen size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{c?.name}</span>
        <span className="block truncate text-[11.5px] text-ink-muted">{p?.name}</span>
      </span>
      <span className="shrink-0 text-right text-[11.5px] text-ink-muted">
        {kind === 'in' ? `Arrives ${booking.checkIn}` : `Departs ${booking.checkOut}`}
      </span>
    </li>
  )
}

function ListView({ properties, freeingUp }: { properties: Property[]; freeingUp: Array<{ property: Property; inDays: number }> }) {
  const groups = [
    { key: 'available', title: 'Free now', body: 'Marketed and ready to let today.' },
    { key: 'reserved', title: 'Reserved', body: 'Agreement signed, move-in pending.' },
    { key: 'occupied', title: 'Occupied', body: 'Currently let on a lease or stay.' },
    { key: 'maintenance', title: 'Under maintenance', body: 'Off the market while work completes.' },
    { key: 'inactive', title: 'Inactive', body: 'Excluded from availability entirely.' },
  ] as const

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Becoming available" subtitle="Properties freeing up in the next 60 days — start re-marketing before the gap opens" />
        {freeingUp.length === 0 ? (
          <EmptyState icon={<CalendarRange size={20} />} title="Nothing frees up soon" body="Every committed property runs beyond the next 60 days." />
        ) : (
          <ul className="mt-3 divide-y divide-[rgb(var(--c-border))]">
            {freeingUp.map(({ property, inDays }) => (
              <li key={property.id}>
                <Link to={`/properties/${property.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-inset/60 sm:px-6">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{property.name}</span>
                    <span className="block truncate text-[12px] text-ink-muted">{property.address.district} · {money(property.price)}{property.mode === 'short_stay' ? '/night' : '/month'}</span>
                  </span>
                  <StatusChip status={property.status} />
                  <Chip className={inDays <= 14 ? 'bg-gold-soft text-gold-ink' : 'bg-surface-inset text-ink-secondary'}>
                    {property.availableFrom ? shortDate(property.availableFrom) : '—'} · {relativeDay(property.availableFrom ?? '')}
                  </Chip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {groups.map((g) => {
        const rows = properties.filter((p) => p.status === g.key)
        if (rows.length === 0) return null
        return (
          <Card key={g.key}>
            <CardHeader title={`${g.title} · ${rows.length}`} subtitle={g.body} />
            <ul className="mt-3 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((p) => (
                <li key={p.id} className="bg-surface-card">
                  <Link to={`/properties/${p.id}`} className="flex h-full items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-inset/60">
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', PROPERTY_STATUS_META[p.status].dot)} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                      <span className="block truncate text-[11.5px] text-ink-muted">{p.address.district}</span>
                    </span>
                    <span className="tnum shrink-0 text-[12.5px] font-medium text-ink-secondary">{money(p.price, true)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}
