import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { CalendarPlus, ClipboardList, Globe, Search, Users } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import {
  Avatar, Button, Card, Chip, Drawer, EmptyState, SearchInput, SegmentedControl, Select, cx,
} from '../components/ui'
import { useStore } from '../lib/store'
import { can } from '../lib/rbac'
import { TODAY, daysBetween, iso } from '../lib/data'
import { mediumDate, money, relativeDay, shortDate } from '../lib/format'
import { itemVariants, listVariants } from '../lib/motion'
import { isOpenEnded } from '../lib/derive'
import type { Booking, BookingSource, BookingStatus, TenancyMode } from '../lib/types'

const SOURCE_LABEL: Record<BookingSource, string> = {
  direct: 'Direct', airbnb: 'Airbnb', booking_com: 'Booking.com', agency: 'Agency', corporate: 'Corporate',
}

const MODE_LABEL: Record<TenancyMode, string> = {
  long_term: 'Fixed-term lease',
  rental: 'Open-ended rental',
  short_stay: 'Short stay',
}

const STATUS_CHIP: Record<BookingStatus, string> = {
  in_progress: 'bg-gold-soft text-gold-ink',
  upcoming: 'bg-[rgb(var(--c-status-info)/0.12)] text-[rgb(var(--c-status-info))]',
  pending: 'bg-[rgb(var(--c-status-serious)/0.16)] text-[rgb(var(--c-status-serious))]',
  completed: 'bg-surface-inset text-ink-secondary',
  cancelled: 'bg-[rgb(var(--c-status-critical)/0.12)] text-[rgb(var(--c-status-critical))]',
}

export default function Bookings() {
  const { state, toast } = useStore()
  const [status, setStatus] = useState<'all' | BookingStatus>('all')
  const [mode, setMode] = useState<'all' | TenancyMode>('all')
  const [source, setSource] = useState<'all' | BookingSource>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Booking | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.bookings
      .filter((b) => {
        if (status !== 'all' && b.status !== status) return false
        if (mode !== 'all' && b.mode !== mode) return false
        if (source !== 'all' && b.source !== source) return false
        if (!q) return true
        const p = state.properties.find((x) => x.id === b.propertyId)
        const c = state.clients.find((x) => x.id === b.clientId)
        return `${b.reference} ${p?.name ?? ''} ${c?.name ?? ''}`.toLowerCase().includes(q)
      })
      .sort((a, b) => (a.start < b.start ? 1 : -1))
  }, [state.bookings, state.properties, state.clients, status, mode, source, query])

  const counts = useMemo(() => {
    const by = (s: BookingStatus) => state.bookings.filter((b) => b.status === s).length
    return { all: state.bookings.length, in_progress: by('in_progress'), upcoming: by('upcoming'), pending: by('pending'), completed: by('completed'), cancelled: by('cancelled') }
  }, [state.bookings])

  const selectedProperty = selected ? state.properties.find((p) => p.id === selected.propertyId) : undefined
  const selectedClient = selected ? state.clients.find((c) => c.id === selected.clientId) : undefined
  const selectedInvoices = selected ? state.invoices.filter((i) => i.bookingId === selected.id) : []

  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title="Bookings & leases"
        description="Long tenancies and short stays share one pipeline. A twelve-month lease and a three-night stay are the same object, seen at different densities."
        actions={
          can(state.role, 'edit:bookings') && (
            <Button variant="primary" icon={<CalendarPlus size={15} />} onClick={() => toast({ title: 'New agreement', body: 'The booking wizard opens here in the full product.' })}>
              <span className="hidden sm:inline">New agreement</span>
            </Button>
          )
        }
      />

      <motion.div variants={listVariants} initial="initial" animate="animate" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Live now</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{counts.in_progress}</p>
          <p className="mt-2 text-[12px] text-ink-muted">agreements in occupation</p>
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Confirmed ahead</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{counts.upcoming}</p>
          <p className="mt-2 text-[12px] text-ink-muted">arriving in the coming weeks</p>
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Awaiting confirmation</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{counts.pending}</p>
          <p className="mt-2 text-[12px] text-ink-muted">payment or documents outstanding</p>
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Short-stay share</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">
            {Math.round((state.bookings.filter((b) => b.mode === 'short_stay').length / Math.max(1, state.bookings.length)) * 100)}%
          </p>
          <p className="mt-2 text-[12px] text-ink-muted">of all agreements</p>
        </motion.div>
      </motion.div>

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search reference, property or client…" className="min-w-[220px] flex-1" />
          <Select value={mode} onChange={(e) => setMode(e.target.value as any)} aria-label="Filter by letting model" className="w-auto min-w-[160px]">
            <option value="all">All models</option>
            <option value="long_term">Fixed-term lease</option>
            <option value="rental">Open-ended rental</option>
            <option value="short_stay">Short stay</option>
          </Select>
          <Select value={source} onChange={(e) => setSource(e.target.value as any)} aria-label="Filter by booking source" className="w-auto min-w-[150px]">
            <option value="all">All sources</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div className="scroll-x -mx-1 px-1">
          <SegmentedControl
            ariaLabel="Filter by agreement status"
            value={status}
            onChange={setStatus}
            size="sm"
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'in_progress', label: 'In progress', count: counts.in_progress },
              { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
              { value: 'pending', label: 'Pending', count: counts.pending },
              { value: 'completed', label: 'Completed', count: counts.completed },
              { value: 'cancelled', label: 'Cancelled', count: counts.cancelled },
            ]}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search size={22} />}
            title="No agreements match"
            body="Try clearing the source filter or searching for a reference such as STY-7104."
            action={<Button variant="secondary" onClick={() => { setQuery(''); setStatus('all'); setMode('all'); setSource('all') }}>Reset filters</Button>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="scroll-x">
            <table className="w-full min-w-[880px] text-left text-[13px]">
              <thead className="text-ink-muted">
                <tr className="border-b border-line bg-surface-inset/50">
                  <th scope="col" className="px-5 py-3 font-medium sm:px-6">Reference</th>
                  <th scope="col" className="px-4 py-3 font-medium">Client</th>
                  <th scope="col" className="px-4 py-3 font-medium">Property</th>
                  <th scope="col" className="px-4 py-3 font-medium">Term</th>
                  <th scope="col" className="px-4 py-3 font-medium">Source</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium sm:px-6">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--c-border))]">
                {rows.slice(0, 60).map((b) => {
                  const p = state.properties.find((x) => x.id === b.propertyId)
                  const c = state.clients.find((x) => x.id === b.clientId)
                  const nights = Math.max(1, daysBetween(b.start, b.end ?? b.start))
                  const value = b.mode === 'short_stay' ? nights * b.rate : b.rate
                  return (
                    <tr key={b.id} className="cursor-pointer transition-colors hover:bg-surface-inset/60" onClick={() => setSelected(b)}>
                      <td className="px-5 py-3 sm:px-6">
                        <span className="block font-medium text-ink">{b.reference}</span>
                        <span className="block text-[11.5px] text-ink-muted">{b.mode === 'short_stay' ? `${nights} nights` : b.mode === 'rental' ? `${b.advanceMonths}-month advance` : 'Fixed term'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <Avatar name={c?.name ?? '?'} size={26} tone="soft" />
                          <span className="truncate text-ink-secondary">{c?.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">{p?.name}</td>
                      <td className="px-4 py-3 text-ink-secondary">
                        {shortDate(b.start)} – {b.end ? shortDate(b.end) : <span className="text-gold">open-ended</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Chip className="bg-surface-inset text-ink-secondary"><Globe size={10} /> {SOURCE_LABEL[b.source]}</Chip>
                      </td>
                      <td className="px-4 py-3"><Chip className={STATUS_CHIP[b.status]}>{b.status.replace(/_/g, ' ')}</Chip></td>
                      <td className="tnum px-5 py-3 text-right font-semibold text-ink sm:px-6">{money(value)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 60 && (
            <p className="border-t border-line px-5 py-3 text-[12px] text-ink-muted sm:px-6">
              Showing the first 60 of {rows.length} matching agreements — narrow the filters to see the rest.
            </p>
          )}
        </Card>
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.reference ?? ''}
        subtitle={selected && <span>{MODE_LABEL[selected.mode]} · {SOURCE_LABEL[selected.source]}</span>}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
            {can(state.role, 'edit:bookings') && (
              <Button variant="primary" onClick={() => { toast({ title: 'Agreement updated', body: `${selected?.reference} would be edited here.`, tone: 'success' }); setSelected(null) }}>
                Edit agreement
              </Button>
            )}
          </>
        }
      >
        {selected && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-inset/50 p-4">
              <Avatar name={selectedClient?.name ?? '?'} size={44} tone="navy" />
              <div className="min-w-0 flex-1">
                <Link to={`/clients/${selected.clientId}`} className="block truncate text-[14px] font-semibold text-ink hover:text-gold">{selectedClient?.name}</Link>
                <p className="truncate text-[12px] text-ink-muted">{selectedClient?.email}</p>
              </div>
              <Chip className={STATUS_CHIP[selected.status]}>{selected.status.replace(/_/g, ' ')}</Chip>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-[13px]">
              <Detail label="Property" value={<Link to={`/properties/${selected.propertyId}`} className="text-ink hover:text-gold">{selectedProperty?.name}</Link>} />
              <Detail label="District" value={selectedProperty?.address.district ?? '—'} />
              <Detail label="Starts" value={`${mediumDate(selected.start)} · ${selected.checkIn}`} />
              <Detail
                label="Ends"
                value={selected.end ? `${mediumDate(selected.end)} · ${selected.checkOut}` : 'Open-ended — runs until notice'}
              />
              <Detail label="Rate" value={`${money(selected.rate)} ${selected.mode === 'short_stay' ? 'per night' : 'per month'}`} />
              <Detail label="Deposit held" value={money(selected.deposit)} />
              {selected.mode === 'rental' ? (
                <>
                  <Detail label="Advance taken" value={`${selected.advanceMonths} months · ${money(selected.rate * selected.advanceMonths)}`} />
                  <Detail label="Notice required" value={`${selected.noticeDays} days`} />
                  <Detail label="Rent paid through" value={selected.paidThrough ? mediumDate(selected.paidThrough) : 'Advance not yet cleared'} />
                </>
              ) : (
                <Detail label="Guests" value={String(selected.guests)} />
              )}
              <Detail label="Created" value={mediumDate(selected.createdAt)} />
            </dl>

            <div>
              <h4 className="text-[13px] font-semibold text-ink">Notes</h4>
              <p className="mt-2 rounded-xl border border-line bg-surface-inset/60 p-3.5 text-[12.5px] leading-relaxed text-ink-secondary">{selected.notes}</p>
            </div>

            {can(state.role, 'view:payments') && selectedInvoices.length > 0 && (
              <div>
                <h4 className="text-[13px] font-semibold text-ink">Linked charges</h4>
                <ul className="mt-2 divide-y divide-[rgb(var(--c-border))] rounded-xl border border-line">
                  {selectedInvoices.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-medium text-ink">{i.number}</span>
                        <span className="block truncate text-[11.5px] text-ink-muted">{i.memo} · due {shortDate(i.dueOn)}</span>
                      </span>
                      <span className="tnum shrink-0 text-[12.5px] font-semibold text-ink">{money(i.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selected.status !== 'completed' && selected.status !== 'cancelled' && (
              <div className="rounded-xl border border-gold/40 bg-gold-soft/40 p-3.5">
                <p className="text-[12.5px] font-medium text-gold-ink">
                  {isOpenEnded(selected)
                    ? selected.paidThrough && daysBetween(iso(TODAY), selected.paidThrough) < 0
                      ? `Rent lapsed ${Math.abs(daysBetween(iso(TODAY), selected.paidThrough))} days ago. The ${selected.advanceMonths}-month cycle is spent — collect the next one before the arrears grow.`
                      : selected.paidThrough
                        ? `Rent is covered to ${mediumDate(selected.paidThrough)}, then the next ${selected.advanceMonths}-month cycle falls due. ${selected.noticeDays} days notice to end the tenancy.`
                        : `The first ${selected.advanceMonths}-month advance is still to clear. Keys release once it does.`
                    : selected.end && daysBetween(iso(TODAY), selected.end) >= 0
                      ? `${selected.mode === 'short_stay' ? 'Check-out' : 'Lease end'} ${relativeDay(selected.end)} — turnover and cleaning can be scheduled from the maintenance board.`
                      : 'This agreement has run past its end date. Confirm the renewal or close it off.'}
                </p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11.5px] uppercase tracking-[0.08em] text-ink-muted">{label}</dt>
      <dd className="mt-1 text-[13px] text-ink-secondary">{value}</dd>
    </div>
  )
}
