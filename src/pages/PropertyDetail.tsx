import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import {
  Bath, BedDouble, CalendarRange, Check, Download, FileText, Maximize2, MapPin, Pencil,
  Receipt, Star, TrendingUp, User, Wrench,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { PropertyImage } from '../components/PropertyImage'
import { ChartFrame, ColumnChart, VIZ } from '../components/charts'
import {
  Avatar, Button, Card, CardHeader, Chip, EmptyState, InvoiceChip, MaintenanceChip, Meter,
  PROPERTY_STATUS_META, PriorityChip, Select, StatusChip, Tabs, cx, statusLabel,
} from '../components/ui'
import { useStore } from '../lib/store'
import { can } from '../lib/rbac'
import { TODAY, daysBetween, iso } from '../lib/data'
import { mediumDate, money, relativeDay, shortDate } from '../lib/format'
import { itemVariants, listVariants } from '../lib/motion'
import type { PropertyStatus } from '../lib/types'

type Tab = 'overview' | 'occupancy' | 'financials' | 'maintenance' | 'documents' | 'activity'

export default function PropertyDetail() {
  const { id = '' } = useParams()
  const { state, dispatch, toast } = useStore()
  const [tab, setTab] = useState<Tab>('overview')

  const property = state.properties.find((p) => p.id === id)
  const invoices = useMemo(() => state.invoices.filter((i) => i.propertyId === id), [state.invoices, id])
  const jobs = useMemo(() => state.maintenance.filter((m) => m.propertyId === id), [state.maintenance, id])
  const bookings = useMemo(
    () => state.bookings.filter((b) => b.propertyId === id).sort((a, b) => (a.start < b.start ? 1 : -1)),
    [state.bookings, id],
  )

  if (!property) {
    return (
      <Card>
        <EmptyState icon={<MapPin size={22} />} title="Property not found" body="That property is no longer in the portfolio." action={<Link to="/properties"><Button variant="secondary">Back to properties</Button></Link>} />
      </Card>
    )
  }

  const manager = state.team.find((t) => t.id === property.managerId)
  const current = bookings.find((b) => b.status === 'in_progress')
  const currentClient = current ? state.clients.find((c) => c.id === current.clientId) : undefined
  const rentCovered = current?.paidThrough ? daysBetween(iso(TODAY), current.paidThrough) : 0
  const revenue = invoices.reduce((a, i) => a + i.paidAmount, 0)
  const outstanding = invoices.reduce((a, i) => a + (i.amount - i.paidAmount), 0)
  const spend = jobs.reduce((a, m) => a + (m.actualCost ?? 0), 0)
  const openJobs = jobs.filter((m) => m.status !== 'completed')

  const monthly = useMemo(() => {
    const out: Array<{ label: string; income: number; costs: number }> = []
    for (let m = 5; m >= 0; m--) {
      const ref = new Date(TODAY.getFullYear(), TODAY.getMonth() - m, 1)
      const key = iso(ref).slice(0, 7)
      out.push({
        label: ref.toLocaleDateString('en-GB', { month: 'short' }),
        income: invoices.filter((i) => i.paidOn?.slice(0, 7) === key).reduce((a, i) => a + i.paidAmount, 0),
        costs: jobs.filter((j) => j.completedOn?.slice(0, 7) === key).reduce((a, j) => a + (j.actualCost ?? 0), 0),
      })
    }
    return out
  }, [invoices, jobs])

  const changeStatus = (next: PropertyStatus) => {
    dispatch({ type: 'set-property-status', id: property.id, status: next })
    toast({ title: `${property.name} is now ${statusLabel(next).toLowerCase()}`, tone: 'success' })
  }

  const tabs: Array<{ value: Tab; label: string; count?: number }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'occupancy', label: 'Occupancy', count: bookings.length },
    ...(can(state.role, 'view:financials') ? [{ value: 'financials' as Tab, label: 'Financials', count: invoices.length }] : []),
    { value: 'maintenance', label: 'Maintenance', count: openJobs.length },
    { value: 'documents', label: 'Documents', count: property.documents.length },
    { value: 'activity', label: 'Activity' },
  ]

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Properties', to: '/properties' }, { label: property.name }]}
        title={property.name}
        description={`${property.address.line1}, ${property.address.district}, ${property.address.city} · ${property.code}`}
        actions={
          <>
            {can(state.role, 'edit:properties') && (
              <Select
                value={property.status}
                onChange={(e) => changeStatus(e.target.value as PropertyStatus)}
                aria-label="Change property status"
                className="w-auto min-w-[176px]"
              >
                {(Object.keys(PROPERTY_STATUS_META) as PropertyStatus[]).map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </Select>
            )}
            <Button variant="secondary" icon={<CalendarRange size={15} />}><Link to="/availability">Calendar</Link></Button>
            {can(state.role, 'edit:properties') && (
              <Button variant="primary" icon={<Pencil size={15} />} onClick={() => toast({ title: 'Editing is disabled in the demo', body: 'The edit drawer opens here in the full product.' })}>
                Edit
              </Button>
            )}
          </>
        }
      />

      {/* --------------------------------- Hero -------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="relative h-56 sm:h-72">
            <PropertyImage seed={property.photoSeed} type={property.type} className="h-full" rounded="" />
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              <StatusChip status={property.status} onImage />
              <Chip className="bg-navy-950/75 text-white ring-1 ring-white/15 backdrop-blur-sm">
                {property.mode === 'short_stay' ? 'Short stay' : property.mode === 'rental' ? 'Open-ended rental' : 'Fixed-term lease'}
              </Chip>
            </div>
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
              <div className="text-white">
                <p className="tnum text-2xl font-semibold leading-none">
                  {money(property.price)}
                  <span className="ml-1.5 text-[13px] font-normal opacity-80">{property.mode === 'short_stay' ? '/ night' : '/ month'}</span>
                </p>
              </div>
              <Chip className="bg-navy-950/70 text-white backdrop-blur-sm">
                <Star size={11} className="fill-gold text-gold" /> {property.rating.toFixed(1)}
              </Chip>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-[rgb(var(--c-border))] border-t border-line sm:grid-cols-4">
            <Fact icon={<BedDouble size={15} />} label="Bedrooms" value={property.bedrooms || '—'} />
            <Fact icon={<Bath size={15} />} label="Bathrooms" value={property.bathrooms} />
            <Fact icon={<Maximize2 size={15} />} label="Floor area" value={`${property.sizeSqm} m²`} />
            <Fact icon={<TrendingUp size={15} />} label="Gross yield" value={`${property.yieldPct}%`} />
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="card-pad">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Assigned manager</p>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={manager?.name ?? '—'} size={42} tone="navy" />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-ink">{manager?.name}</p>
                <p className="truncate text-[12px] text-ink-muted">{manager?.title}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[12.5px]">
              <div className="flex justify-between gap-3"><dt className="text-ink-muted">Email</dt><dd className="truncate text-ink-secondary">{manager?.email}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-muted">Direct line</dt><dd className="text-ink-secondary">{manager?.phone}</dd></div>
            </dl>
          </Card>

          <Card className="card-pad flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Current position</p>
            {current && currentClient ? (
              <div className="mt-3">
                <Link to={`/clients/${currentClient.id}`} className="group flex items-center gap-3">
                  <Avatar name={currentClient.name} size={38} tone="gold" />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-ink group-hover:text-gold">{currentClient.name}</p>
                    <p className="truncate text-[12px] text-ink-muted">{current.reference} · {current.mode === 'short_stay' ? 'Short stay' : current.mode === 'rental' ? 'Open-ended rental' : 'Fixed-term lease'}</p>
                  </div>
                </Link>
                <div className="mt-4 space-y-3 border-t border-line pt-4">
                  {current.mode === 'rental' ? (
                    <>
                      <div className="flex justify-between text-[12.5px]">
                        <span className="text-ink-muted">Started</span>
                        <span className="text-ink-secondary">{mediumDate(current.start)} · open-ended</span>
                      </div>
                      <div className="flex justify-between text-[12.5px]">
                        <span className="text-ink-muted">Payment cycle</span>
                        <span className="text-ink-secondary">{current.advanceMonths} months in advance</span>
                      </div>
                      <div className="flex justify-between text-[12.5px]">
                        <span className="text-ink-muted">Notice required</span>
                        <span className="text-ink-secondary">{current.noticeDays} days</span>
                      </div>
                      <div>
                        <div className="mb-1.5 flex justify-between text-[12.5px]">
                          <span className="text-ink-muted">Rent covered to</span>
                          <span className={cx(rentCovered < 0 ? 'text-[rgb(var(--c-status-critical))]' : 'text-ink-secondary')}>
                            {current.paidThrough ? mediumDate(current.paidThrough) : '—'}
                          </span>
                        </div>
                        <Meter
                          value={Math.max(0, Math.min(rentCovered, 90))}
                          max={90}
                          tone={rentCovered < 0 ? 'critical' : rentCovered < 14 ? 'gold' : 'good'}
                          label="Days of rent remaining before the tenancy lapses"
                        />
                        <p className="mt-1.5 text-[11.5px] text-ink-muted">
                          {rentCovered < 0
                            ? `${Math.abs(rentCovered)} days in arrears`
                            : `${rentCovered} days of rent remaining`}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-[12.5px]">
                        <span className="text-ink-muted">Term</span>
                        <span className="text-ink-secondary">
                          {mediumDate(current.start)} – {current.end ? mediumDate(current.end) : 'open-ended'}
                        </span>
                      </div>
                      <div>
                        <div className="mb-1.5 flex justify-between text-[12.5px]">
                          <span className="text-ink-muted">Term elapsed</span>
                          <span className="text-ink-secondary">
                            {current.end ? `${Math.max(0, daysBetween(iso(TODAY), current.end))} days remaining` : 'no fixed end'}
                          </span>
                        </div>
                        <Meter
                          value={Math.max(0, daysBetween(current.start, iso(TODAY)))}
                          max={Math.max(1, current.end ? daysBetween(current.start, current.end) : 365)}
                          tone="gold"
                          label="Proportion of the term elapsed"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-[13px] leading-relaxed text-ink-secondary">
                  {property.status === 'available'
                    ? `Vacant and marketed. Available since ${property.availableFrom ? mediumDate(property.availableFrom) : 'recently'}.`
                    : property.status === 'reserved'
                      ? 'Reserved — the incoming agreement is signed and awaiting move-in.'
                      : property.status === 'maintenance'
                        ? 'Off the market while maintenance work completes.'
                        : 'Currently inactive and excluded from availability.'}
                </p>
                {property.availableFrom && daysBetween(iso(TODAY), property.availableFrom) > 0 && (
                  <Chip className="bg-gold-soft text-gold-ink">Available from {shortDate(property.availableFrom)}</Chip>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* --------------------------------- Tabs -------------------------------- */}
      <div className="mt-6">
        <Tabs<Tab> ariaLabel="Property sections" value={tab} onChange={setTab} tabs={tabs} />
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="mt-5">
        {tab === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="card-pad lg:col-span-2">
              <h3 className="text-[15px] font-semibold text-ink">Amenities & features</h3>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {property.amenities.map((a) => (
                  <li key={a} className="flex items-center gap-2 text-[13px] text-ink-secondary">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gold-soft text-gold-ink"><Check size={12} strokeWidth={3} /></span>
                    {a}
                  </li>
                ))}
              </ul>

              <h3 className="mt-7 text-[15px] font-semibold text-ink">Manager notes</h3>
              <p className="mt-2 rounded-xl border border-line bg-surface-inset/60 p-4 text-[13.5px] leading-relaxed text-ink-secondary">
                {property.notes}
              </p>
            </Card>

            <Card className="card-pad">
              <h3 className="text-[15px] font-semibold text-ink">Key facts</h3>
              <dl className="mt-4 divide-y divide-[rgb(var(--c-border))] text-[13px]">
                {[
                  ['Reference', property.code],
                  ['Type', { apartment: 'Apartment', house: 'House', villa: 'Villa', serviced: 'Serviced apartment', short_stay: 'Short-stay listing', commercial: 'Commercial' }[property.type]],
                  ['Letting model', property.mode === 'short_stay' ? 'Short stay' : property.mode === 'rental' ? 'Open-ended rental' : 'Fixed-term lease'],
                  ['District', property.address.district],
                  ['Acquired', mediumDate(property.acquiredOn)],
                  ['Documents', `${property.documents.length} on file`],
                  ['Open jobs', String(openJobs.length)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="text-ink-muted">{k}</dt>
                    <dd className="text-right text-ink-secondary">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        )}

        {tab === 'occupancy' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Occupancy history" subtitle="Every agreement recorded against this property" />
              <ol className="mt-4 px-5 pb-5 sm:px-6">
                {[...bookings.map((b) => ({
                  key: b.id,
                  who: state.clients.find((c) => c.id === b.clientId)?.name ?? 'Client',
                  from: b.start, to: b.end, mode: b.mode, status: b.status, ref: b.reference,
                })), ...property.occupancyHistory.map((h) => ({
                  key: h.id, who: h.clientName, from: h.from, to: h.to ?? '', mode: h.mode, status: 'completed' as const, ref: 'Archived',
                }))].map((row, i, arr) => (
                  <li key={row.key} className="relative flex gap-4 pb-5 last:pb-0">
                    <span className="relative flex flex-col items-center">
                      <span className={cx('mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-[rgb(var(--c-surface-card))]', row.status === 'in_progress' ? 'bg-gold' : row.status === 'upcoming' ? 'bg-status-info' : 'bg-line-strong')} />
                      {i < arr.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
                    </span>
                    <div className="min-w-0 flex-1 pb-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-[13.5px] font-medium text-ink">{row.who}</p>
                        <p className="text-[12px] text-ink-muted">{shortDate(row.from)} – {row.to ? shortDate(row.to) : 'ongoing'}</p>
                      </div>
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        {row.ref} · {row.mode === 'short_stay' ? 'Short stay' : row.mode === 'rental' ? 'Open-ended rental' : 'Fixed-term lease'} · {row.status.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            <Card className="card-pad">
              <h3 className="text-[15px] font-semibold text-ink">Utilisation</h3>
              <p className="mt-1 text-[12.5px] text-ink-muted">Nights let across all agreements; open-ended rentals counted to today</p>
              <p className="tnum mt-5 text-[32px] font-semibold leading-none text-ink">
                {bookings.reduce((a, b) => a + Math.max(0, daysBetween(b.start, b.end ?? iso(TODAY))), 0)}
              </p>
              <p className="mt-1.5 text-[12.5px] text-ink-muted">nights across {bookings.length} agreements</p>
              <div className="mt-6 space-y-3 border-t border-line pt-5 text-[13px]">
                <div className="flex justify-between"><span className="text-ink-muted">Completed</span><span className="tnum text-ink-secondary">{bookings.filter((b) => b.status === 'completed').length}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Live now</span><span className="tnum text-ink-secondary">{bookings.filter((b) => b.status === 'in_progress').length}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Upcoming</span><span className="tnum text-ink-secondary">{bookings.filter((b) => b.status === 'upcoming').length}</span></div>
              </div>
            </Card>
          </div>
        )}

        {tab === 'financials' && (
          <div className="grid gap-4">
            <motion.div variants={listVariants} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-3">
              <motion.div variants={itemVariants}><MiniStat label="Revenue collected" value={money(revenue)} tone="good" /></motion.div>
              <motion.div variants={itemVariants}><MiniStat label="Outstanding" value={money(outstanding)} tone={outstanding > 0 ? 'critical' : 'default'} /></motion.div>
              <motion.div variants={itemVariants}><MiniStat label="Maintenance spend" value={money(spend)} /></motion.div>
            </motion.div>

            <ChartFrame
              title="Income against maintenance cost"
              subtitle="Last six months for this property"
              legend={[{ label: 'Income', color: VIZ[0] }, { label: 'Maintenance', color: VIZ[4] }]}
              table={
                <table className="w-full text-left text-[12.5px]">
                  <thead className="text-ink-muted"><tr className="border-b border-line"><th className="py-2 pr-4 font-medium">Month</th><th className="py-2 pr-4 text-right font-medium">Income</th><th className="py-2 text-right font-medium">Maintenance</th></tr></thead>
                  <tbody className="divide-y divide-[rgb(var(--c-border))]">
                    {monthly.map((m) => (
                      <tr key={m.label}><td className="py-2 pr-4 text-ink-secondary">{m.label}</td><td className="tnum py-2 pr-4 text-right text-ink">{money(m.income)}</td><td className="tnum py-2 text-right text-ink-secondary">{money(m.costs)}</td></tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <ColumnChart
                data={monthly}
                xKey="label"
                series={[{ key: 'income', label: 'Income', color: VIZ[0] }, { key: 'costs', label: 'Maintenance', color: VIZ[4] }]}
                format={(n) => money(n, true)}
                height={210}
              />
            </ChartFrame>

            <Card className="overflow-hidden">
              <CardHeader title="Invoices" subtitle={`${invoices.length} charges raised against this property`} />
              <div className="scroll-x mt-3">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <thead className="text-ink-muted">
                    <tr className="border-y border-line bg-surface-inset/50">
                      <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Invoice</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Memo</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                      <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgb(var(--c-border))]">
                    {invoices.slice(0, 12).map((i) => (
                      <tr key={i.id} className="transition-colors hover:bg-surface-inset/60">
                        <td className="px-5 py-3 font-medium text-ink sm:px-6">{i.number}</td>
                        <td className="px-4 py-3 text-ink-secondary">{i.memo}</td>
                        <td className="px-4 py-3 text-ink-secondary">{shortDate(i.dueOn)}</td>
                        <td className="px-4 py-3"><InvoiceChip status={i.status} /></td>
                        <td className="tnum px-5 py-3 text-right font-semibold text-ink sm:px-6">{money(i.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {tab === 'maintenance' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Maintenance jobs" subtitle={`${openJobs.length} open · ${jobs.length} total`} />
              {jobs.length === 0 ? (
                <EmptyState icon={<Wrench size={20} />} title="No maintenance recorded" body="Nothing has been reported against this property. Jobs raised from the portal or an inspection will appear here." />
              ) : (
                <ul className="mt-3 divide-y divide-[rgb(var(--c-border))]">
                  {jobs.map((m) => (
                    <li key={m.id} className="px-5 py-4 sm:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-medium text-ink">{m.title}</p>
                          <p className="mt-0.5 text-[12px] text-ink-muted">{m.reference} · {m.vendor} · due {shortDate(m.dueOn)}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <PriorityChip priority={m.priority} />
                          <MaintenanceChip status={m.status} />
                        </div>
                      </div>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-secondary">{m.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="card-pad">
              <h3 className="text-[15px] font-semibold text-ink">Maintenance notes</h3>
              <ul className="mt-4 space-y-3">
                {property.maintenanceNotes.map((n, i) => (
                  <li key={i} className="rounded-xl border border-line bg-surface-inset/60 p-3.5 text-[12.5px] leading-relaxed text-ink-secondary">
                    {n}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        {tab === 'documents' && (
          <Card>
            <CardHeader title="Documents" subtitle={`${property.documents.length} files on file for this property`} action={<Button size="sm" variant="secondary" icon={<Download size={14} />}>Download all</Button>} />
            <ul className="mt-3 divide-y divide-[rgb(var(--c-border))]">
              {property.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-inset/60 sm:px-6">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-inset text-ink-muted"><FileText size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{d.name}</span>
                    <span className="block truncate text-[11.5px] text-ink-muted">{d.category} · {(d.sizeKb / 1024).toFixed(1)} MB · uploaded {mediumDate(d.uploadedAt)} by {d.uploadedBy}</span>
                  </span>
                  <Button size="sm" variant="ghost" icon={<Download size={14} />}><span className="sr-only">Download {d.name}</span></Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab === 'activity' && (
          <Card>
            <CardHeader title="Activity" subtitle="Everything that has happened on this property, newest first" />
            <ol className="mt-4 px-5 pb-6 sm:px-6">
              {[
                ...jobs.flatMap((j) => j.timeline.map((t) => ({ at: t.at, label: `${t.label} — ${j.title}`, by: t.by, icon: <Wrench size={13} /> }))),
                ...invoices.filter((i) => i.paidOn).slice(0, 8).map((i) => ({ at: i.paidOn!, label: `Payment received — ${money(i.paidAmount)} against ${i.number}`, by: 'Finance', icon: <Receipt size={13} /> })),
                ...bookings.slice(0, 6).map((b) => ({ at: b.createdAt, label: `Agreement ${b.reference} created`, by: 'Lettings', icon: <User size={13} /> })),
              ]
                .sort((a, b) => (a.at < b.at ? 1 : -1))
                .slice(0, 14)
                .map((e, i, arr) => (
                  <li key={`${e.at}-${i}`} className="relative flex gap-4 pb-5 last:pb-0">
                    <span className="relative flex flex-col items-center">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-inset text-ink-muted ring-4 ring-[rgb(var(--c-surface-card))]">{e.icon}</span>
                      {i < arr.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-ink">{e.label}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-muted">{mediumDate(e.at)} · {e.by}</p>
                    </div>
                  </li>
                ))}
            </ol>
          </Card>
        )}
      </motion.div>
    </>
  )
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="px-4 py-4 text-center sm:px-5">
      <span className="inline-flex text-ink-muted">{icon}</span>
      <p className="tnum mt-1.5 text-[16px] font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-[11.5px] text-ink-muted">{label}</p>
    </div>
  )
}

function MiniStat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'critical' }) {
  const colors = { default: 'text-ink', good: 'text-[rgb(var(--c-status-good))]', critical: 'text-[rgb(var(--c-status-critical))]' }
  return (
    <div className="card card-pad">
      <p className="text-[12.5px] font-medium text-ink-secondary">{label}</p>
      <p className={cx('tnum mt-2 text-[24px] font-semibold leading-none', colors[tone])}>{value}</p>
    </div>
  )
}
