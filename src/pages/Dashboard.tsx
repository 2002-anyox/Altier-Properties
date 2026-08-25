import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight, Banknote, BedDouble, Building2, CalendarCheck, CalendarClock, CircleDollarSign,
  DoorOpen, Plus, Sparkles, TriangleAlert, Users, Wrench,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { StatTile } from '../components/StatTile'
import { AreaTrendChart, ChartFrame, DonutChart, VIZ, VIZ_STATUS } from '../components/charts'
import { Button, Card, CardHeader, Chip, EmptyState, Meter, PROPERTY_STATUS_META, StatusChip, cx } from '../components/ui'
import { useStore } from '../lib/store'
import { can } from '../lib/rbac'
import { TODAY, daysBetween, iso } from '../lib/data'
import { money, relativeDay, shortDate } from '../lib/format'
import { ageingBuckets, computeKpis, occupancyMix, revenueSeries, upcomingAvailability } from '../lib/derive'
import { listVariants } from '../lib/motion'

export default function Dashboard() {
  const { state } = useStore()
  const navigate = useNavigate()
  const { properties, invoices, clients, maintenance, bookings, role } = state
  const me = state.team.find((t) => t.id === state.currentUserId) ?? state.team[0]

  const kpis = useMemo(() => computeKpis(properties, invoices, clients, maintenance, bookings), [properties, invoices, clients, maintenance, bookings])
  const revenue = useMemo(() => revenueSeries(invoices), [invoices])
  const mix = useMemo(() => occupancyMix(properties), [properties])
  const ageing = useMemo(() => ageingBuckets(invoices), [invoices])
  const freeingUp = useMemo(() => upcomingAvailability(properties, 45).slice(0, 5), [properties])
  const today = iso(TODAY)

  const movements = useMemo(() => {
    return bookings
      .filter((b) => b.status !== 'cancelled')
      .flatMap((b) => {
        const rows: Array<{ id: string; kind: 'in' | 'out'; date: string; booking: typeof b }> = []
        const inGap = daysBetween(today, b.start)
        const outGap = daysBetween(today, b.end)
        if (inGap >= 0 && inGap <= 7) rows.push({ id: `${b.id}-in`, kind: 'in', date: b.start, booking: b })
        if (outGap >= 0 && outGap <= 7) rows.push({ id: `${b.id}-out`, kind: 'out', date: b.end, booking: b })
        return rows
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 6)
  }, [bookings, today])

  const overdue = useMemo(
    () => invoices.filter((i) => i.status === 'overdue' || i.status === 'partial').slice(0, 5),
    [invoices],
  )

  const upcoming = useMemo(
    () =>
      invoices
        .filter((i) => (i.status === 'upcoming' || i.status === 'pending') && daysBetween(today, i.dueOn) >= 0 && daysBetween(today, i.dueOn) <= 14)
        .sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1))
        .slice(0, 5),
    [invoices, today],
  )

  const maintenanceStages = useMemo(() => {
    const open = maintenance.filter((m) => m.status !== 'completed')
    return [
      { label: 'Reported', count: open.filter((m) => m.status === 'reported').length },
      { label: 'Scheduled', count: open.filter((m) => m.status === 'scheduled').length },
      { label: 'In progress', count: open.filter((m) => m.status === 'in_progress').length },
      { label: 'Awaiting parts', count: open.filter((m) => m.status === 'awaiting_parts').length },
    ]
  }, [maintenance])

  const revenueTrend = revenue.map((r) => r.collected)
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const showMoney = can(role, 'view:financials')

  const statusColors: Record<string, string> = {
    occupied: VIZ[0],
    reserved: VIZ[1],
    available: VIZ[2],
    maintenance: VIZ[4],
    inactive: VIZ[3],
  }

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting}, ${me.name.split(' ')[0]}`}
        description={`${kpis.totalProperties} properties across Lisbon and the coast. ${kpis.overdueCount > 0 ? `${kpis.overdueCount} payments need chasing today.` : 'Collections are clean today.'}`}
        actions={
          <>
            <Button variant="secondary" icon={<CalendarClock size={15} />} onClick={() => navigate('/availability')}>
              Availability
            </Button>
            {can(role, 'edit:properties') && (
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/properties')}>
                Add property
              </Button>
            )}
          </>
        }
      />

      {/* ---------------------------- Hero + KPI row --------------------------- */}
      <motion.div variants={listVariants} initial="initial" animate="animate" className="grid gap-4 lg:grid-cols-3">
        {showMoney && (
          <motion.div variants={listVariants} className="lg:col-span-1">
            <div className="card relative h-full overflow-hidden bg-navy-900 p-6 text-[rgb(var(--c-text-onrail))] dark:bg-surface-card">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-3xl" aria-hidden />
              <div className="relative">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
                  <Sparkles size={12} /> This month
                </p>
                <p className="mt-4 text-[44px] font-semibold leading-none tracking-[-0.03em] text-white dark:text-ink">
                  {money(kpis.monthlyRevenue, 'EUR')}
                </p>
                <p className="mt-2.5 text-[13px] text-[rgb(var(--c-text-onrail-muted))] dark:text-ink-muted">
                  Collected revenue ·{' '}
                  <span className={cx('font-medium', kpis.monthlyRevenueDelta >= 0 ? 'text-[#7BD88F]' : 'text-[#F0A9A9]')}>
                    {kpis.monthlyRevenueDelta >= 0 ? '+' : ''}{kpis.monthlyRevenueDelta.toFixed(1)}%
                  </span>{' '}
                  vs last month
                </p>

                <div className="mt-6 space-y-3.5 border-t border-white/10 pt-5 dark:border-line">
                  <Row label="Collection rate" value={`${kpis.collectionRate.toFixed(1)}%`} meter={kpis.collectionRate} />
                  <Row label="Upcoming (30 days)" value={money(kpis.upcomingAmount, 'EUR', true)} />
                  <Row label="Overdue balance" value={money(kpis.overdueAmount, 'EUR', true)} tone="critical" />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <motion.div
          variants={listVariants}
          className={cx('grid gap-4 sm:grid-cols-2', showMoney ? 'lg:col-span-2' : 'lg:col-span-3 xl:grid-cols-4')}
        >
          <StatTile
            label="Total properties" value={String(kpis.totalProperties)} rawValue={kpis.totalProperties}
            footnote={`${kpis.inactiveUnits} inactive · ${properties.filter((p) => p.mode === 'short_stay').length} short-stay`}
            to="/properties" icon={<Building2 size={15} />} tone="gold"
          />
          <StatTile
            label="Occupied units" value={String(kpis.occupiedUnits)} rawValue={kpis.occupiedUnits}
            footnote={`${kpis.occupancyRate.toFixed(0)}% occupancy including reserved`}
            to="/properties?status=occupied" icon={<BedDouble size={15} />}
          />
          <StatTile
            label="Vacant units" value={String(kpis.vacantUnits)} rawValue={kpis.vacantUnits}
            footnote={`${kpis.vacancyRate.toFixed(0)}% vacancy rate`}
            to="/properties?status=available" icon={<DoorOpen size={15} />}
          />
          <StatTile
            label="Active clients" value={String(kpis.activeClients)} rawValue={kpis.activeClients}
            footnote={`${clients.filter((c) => c.kind === 'corporate').length} corporate accounts`}
            to="/clients" icon={<Users size={15} />}
          />
          {showMoney && (
            <>
              <StatTile
                label="Overdue payments" value={money(kpis.overdueAmount, 'EUR', true)} rawValue={kpis.overdueAmount}
                format={(n) => money(n, 'EUR', true)}
                footnote={`${kpis.overdueCount} invoices past due`} to="/payments?status=overdue"
                icon={<TriangleAlert size={15} />} tone="critical"
              />
              <StatTile
                label="Upcoming payments" value={money(kpis.upcomingAmount, 'EUR', true)} rawValue={kpis.upcomingAmount}
                format={(n) => money(n, 'EUR', true)}
                footnote={`${kpis.upcomingCount} due in the next 30 days`} to="/payments?status=upcoming"
                icon={<CircleDollarSign size={15} />}
              />
            </>
          )}
          <StatTile
            label="Open maintenance" value={String(kpis.openMaintenance)} rawValue={kpis.openMaintenance}
            footnote={`${kpis.urgentMaintenance} urgent or high priority`} to="/maintenance"
            icon={<Wrench size={15} />} tone={kpis.urgentMaintenance > 0 ? 'critical' : 'default'}
          />
          {!showMoney && (
            <StatTile
              label="Reserved units" value={String(kpis.reservedUnits)} rawValue={kpis.reservedUnits}
              footnote="Confirmed, awaiting move-in" to="/properties?status=reserved" icon={<CalendarCheck size={15} />}
            />
          )}
        </motion.div>
      </motion.div>

      {/* ------------------------------ Charts row ----------------------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {showMoney && (
          <ChartFrame
            className="xl:col-span-2"
            title="Revenue collected vs billed"
            subtitle="Rolling twelve months across the whole portfolio"
            legend={[
              { label: 'Collected', color: VIZ[0] },
              { label: 'Billed', color: VIZ[1] },
            ]}
            table={
              <table className="w-full text-left text-[12.5px]">
                <thead className="text-ink-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pr-4 font-medium">Month</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Collected</th>
                    <th scope="col" className="py-2 text-right font-medium">Billed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--c-border))]">
                  {revenue.map((r) => (
                    <tr key={r.key}>
                      <td className="py-2 pr-4 text-ink-secondary">{r.key}</td>
                      <td className="tnum py-2 pr-4 text-right text-ink">{money(r.collected)}</td>
                      <td className="tnum py-2 text-right text-ink-secondary">{money(r.billed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <AreaTrendChart
              data={revenue}
              xKey="label"
              series={[
                { key: 'collected', label: 'Collected', color: VIZ[0] },
                { key: 'billed', label: 'Billed', color: VIZ[1], dashed: true },
              ]}
              format={(n) => money(n, 'EUR', true)}
              height={244}
            />
          </ChartFrame>
        )}

        <ChartFrame
          title="Portfolio status"
          subtitle={`${kpis.occupancyRate.toFixed(0)}% occupancy · ${kpis.vacancyRate.toFixed(0)}% vacancy`}
          className={showMoney ? '' : 'xl:col-span-3'}
          table={
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-ink-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-2 text-right font-medium">Properties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--c-border))]">
                {mix.map((m) => (
                  <tr key={m.status}>
                    <td className="py-2 pr-4 text-ink-secondary">{PROPERTY_STATUS_META[m.status].label}</td>
                    <td className="tnum py-2 text-right text-ink">{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <div className="px-3 py-2">
            <DonutChart
              segments={mix.filter((m) => m.count > 0).map((m) => ({
                label: PROPERTY_STATUS_META[m.status].label,
                value: m.count,
                color: statusColors[m.status],
              }))}
              centerValue={`${kpis.occupancyRate.toFixed(0)}%`}
              centerLabel="Occupancy"
              size={168}
            />
          </div>
        </ChartFrame>
      </div>

      {/* ---------------------------- Attention row ---------------------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {showMoney && (
          <Card className="flex flex-col">
            <CardHeader
              title="Needs chasing"
              subtitle={`${money(kpis.overdueAmount, 'EUR')} outstanding`}
              action={<Link to="/payments?status=overdue" className="text-[12.5px] font-medium text-gold link-underline">View all</Link>}
            />
            <div className="mt-3 flex-1">
              {overdue.length === 0 ? (
                <EmptyState icon={<Banknote size={20} />} title="Nothing overdue" body="Every invoice due to date has been settled. The next reminder run is scheduled for tomorrow morning." />
              ) : (
                <ul className="divide-y divide-[rgb(var(--c-border))]">
                  {overdue.map((inv) => {
                    const p = properties.find((x) => x.id === inv.propertyId)
                    const c = clients.find((x) => x.id === inv.clientId)
                    const late = Math.abs(daysBetween(today, inv.dueOn))
                    return (
                      <li key={inv.id}>
                        <Link to={`/payments?invoice=${inv.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-inset sm:px-6">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium text-ink">{c?.name}</span>
                            <span className="block truncate text-[12px] text-ink-muted">{p?.name} · {inv.number}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="tnum block text-[13.5px] font-semibold text-ink">{money(inv.amount - inv.paidAmount)}</span>
                            <span className="block text-[11.5px] text-[rgb(var(--c-status-critical))]">{late}d late</span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-line px-5 py-3 sm:px-6">
              <p className="text-[11.5px] text-ink-muted">Oldest bucket: {ageing.filter((b) => b.count).slice(-1)[0]?.label ?? 'none'}</p>
            </div>
          </Card>
        )}

        <Card className="flex flex-col">
          <CardHeader
            title="Arrivals & departures"
            subtitle="Next seven days"
            action={<Link to="/bookings" className="text-[12.5px] font-medium text-gold link-underline">All bookings</Link>}
          />
          <div className="mt-3 flex-1">
            {movements.length === 0 ? (
              <EmptyState icon={<CalendarCheck size={20} />} title="A quiet week" body="No check-ins or check-outs are scheduled in the next seven days across the portfolio." />
            ) : (
              <ul className="divide-y divide-[rgb(var(--c-border))]">
                {movements.map((m) => {
                  const p = properties.find((x) => x.id === m.booking.propertyId)
                  const c = clients.find((x) => x.id === m.booking.clientId)
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                      <span
                        className={cx(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          m.kind === 'in' ? 'bg-[rgb(var(--c-status-good)/0.12)] text-[rgb(var(--c-status-good))]' : 'bg-surface-inset text-ink-secondary',
                        )}
                        aria-hidden
                      >
                        {m.kind === 'in' ? <ArrowRight size={15} /> : <DoorOpen size={15} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{c?.name}</span>
                        <span className="block truncate text-[12px] text-ink-muted">{p?.name}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[12.5px] font-medium text-ink">{m.kind === 'in' ? 'Check-in' : 'Check-out'}</span>
                        <span className="block text-[11.5px] text-ink-muted">{shortDate(m.date)} · {relativeDay(m.date)}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Maintenance pipeline"
              subtitle={`${kpis.openMaintenance} open jobs`}
              action={<Link to="/maintenance" className="text-[12.5px] font-medium text-gold link-underline">Open board</Link>}
            />
            <ul className="mt-4 space-y-3 px-5 pb-5 sm:px-6">
              {maintenanceStages.map((s) => (
                <li key={s.label}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-[12.5px] text-ink-secondary">{s.label}</span>
                    <span className="tnum text-[12.5px] font-semibold text-ink">{s.count}</span>
                  </div>
                  <Meter value={s.count} max={Math.max(1, kpis.openMaintenance)} tone="gold" label={`${s.label}: ${s.count} jobs`} />
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex-1">
            <CardHeader
              title="Becoming available"
              subtitle="Next 45 days"
              action={<Link to="/availability" className="text-[12.5px] font-medium text-gold link-underline">Calendar</Link>}
            />
            {freeingUp.length === 0 ? (
              <div className="px-5 pb-5 pt-3 text-[13px] text-ink-muted sm:px-6">
                Nothing frees up in the next 45 days — the portfolio is fully committed.
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-[rgb(var(--c-border))]">
                {freeingUp.map(({ property, inDays }) => (
                  <li key={property.id}>
                    <Link to={`/properties/${property.id}`} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-inset sm:px-6">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">{property.name}</span>
                        <span className="block truncate text-[11.5px] text-ink-muted">{property.address.district}</span>
                      </span>
                      <Chip className={inDays <= 14 ? 'bg-gold-soft text-gold-ink' : 'bg-surface-inset text-ink-secondary'}>
                        {inDays === 0 ? 'today' : `${inDays}d`}
                      </Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {showMoney && upcoming.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title="Due in the next fortnight"
            subtitle={`${upcoming.length} payment obligations approaching`}
            action={<Link to="/payments" className="text-[12.5px] font-medium text-gold link-underline">Payments dashboard</Link>}
          />
          <div className="scroll-x mt-3">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="text-ink-muted">
                <tr className="border-y border-line bg-surface-inset/50">
                  <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Client</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Property</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--c-border))]">
                {upcoming.map((inv) => {
                  const p = properties.find((x) => x.id === inv.propertyId)
                  const c = clients.find((x) => x.id === inv.clientId)
                  return (
                    <tr key={inv.id} className="transition-colors hover:bg-surface-inset/60">
                      <td className="px-5 py-3 font-medium text-ink sm:px-6">{c?.name}</td>
                      <td className="px-4 py-3 text-ink-secondary">{p?.name}</td>
                      <td className="px-4 py-3 text-ink-secondary capitalize">{inv.type.replace(/_/g, ' ')}</td>
                      <td className="tnum px-4 py-3 text-right font-semibold text-ink">{money(inv.amount)}</td>
                      <td className="px-5 py-3 text-right text-ink-secondary sm:px-6">
                        {shortDate(inv.dueOn)} <span className="text-ink-muted">· {relativeDay(inv.dueOn)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}

function Row({ label, value, meter, tone }: { label: string; value: string; meter?: number; tone?: 'critical' }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-[rgb(var(--c-text-onrail-muted))] dark:text-ink-muted">{label}</span>
        <span className={cx('tnum text-[13.5px] font-semibold', tone === 'critical' ? 'text-[#F0A9A9]' : 'text-white dark:text-ink')}>{value}</span>
      </div>
      {meter !== undefined && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10 dark:bg-surface-inset">
          <motion.div
            className="h-full rounded-full bg-gold"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, meter)}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      )}
    </div>
  )
}
