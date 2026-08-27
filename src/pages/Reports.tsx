import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Download, FileBarChart, Percent, TrendingUp } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { AreaTrendChart, BarList, ChartFrame, ColumnChart, DonutChart, VIZ } from '../components/charts'
import {
  Button, Card, CardHeader, Meter, PROPERTY_STATUS_META, SegmentedControl, Select, cx, statusLabel,
} from '../components/ui'
import { useStore } from '../lib/store'
import { money, num, pct } from '../lib/format'
import { exportCsv } from '../lib/csv'
import { amountIn } from '../lib/money'
import type { TenancyMode } from '../lib/types'
import {
  ageingBuckets, chargeClass, computeKpis, deferredPortion, earnedInMonth, occupancyMix,
  propertyPerformance, revenueSeries,
} from '../lib/derive'
import { itemVariants, listVariants } from '../lib/motion'

const MODEL_LABEL: Record<TenancyMode, string> = {
  long_term: 'Fixed lease', rental: 'Open rental', short_stay: 'Short stay',
}

type Range = '6m' | '12m'

export default function Reports() {
  const { state, toast } = useStore()
  const [range, setRange] = useState<Range>('12m')
  const [sort, setSort] = useState<'net' | 'revenue' | 'collection' | 'outstanding'>('net')

  const kpis = useMemo(
    () => computeKpis(state.properties, state.invoices, state.clients, state.maintenance, state.bookings),
    [state],
  )
  const revenue = useMemo(() => revenueSeries(state.invoices, range === '6m' ? 6 : 12), [state.invoices, range])
  const mix = useMemo(() => occupancyMix(state.properties), [state.properties])
  const ageing = useMemo(() => ageingBuckets(state.invoices), [state.invoices])
  const performance = useMemo(
    () => propertyPerformance(state.properties, state.invoices, state.maintenance, state.bookings),
    [state],
  )

  const ranked = useMemo(() => {
    return [...performance].sort((a, b) => {
      if (sort === 'revenue') return b.revenue - a.revenue
      if (sort === 'collection') return b.collection - a.collection
      if (sort === 'outstanding') return b.outstanding - a.outstanding
      return b.net - a.net
    })
  }, [performance, sort])

  const byDistrict = useMemo(() => {
    const map = new Map<string, number>()
    performance.forEach((p) => map.set(p.property.address.district, (map.get(p.property.address.district) ?? 0) + p.revenue))
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [performance])

  const byModel = useMemo(() => {
    const rows = [
      { label: 'Fixed lease', mode: 'long_term' as const },
      { label: 'Open rental', mode: 'rental' as const },
      { label: 'Short stay', mode: 'short_stay' as const },
    ]
    return rows.map((r) => {
      const set = performance.filter((p) => p.property.mode === r.mode)
      return {
        label: r.label,
        revenue: set.reduce((a, p) => a + p.revenue, 0),
        costs: set.reduce((a, p) => a + p.costs, 0),
      }
    })
  }, [performance])

  const revenueMix = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7)
    const paid = state.invoices.filter((i) => i.paidOn?.slice(0, 7) === month)
    const deferred = paid.reduce((a, i) => a + deferredPortion(i), 0)
    const deposits = paid.filter((i) => chargeClass(i.type) === 'deposit').reduce((a, i) => a + i.paidAmount, 0)
    return [
      { label: 'Earned', value: earnedInMonth(state.invoices, month), note: 'revenue this month' },
      { label: 'In advance', value: deferred, note: 'for time ahead' },
      { label: 'Deposits held', value: deposits, note: 'refundable' },
    ]
  }, [state.invoices])

  const clientActivity = useMemo(() => {
    return state.clients
      .map((c) => ({
        client: c,
        invoices: state.invoices.filter((i) => i.clientId === c.id),
        messages: c.communications.length,
      }))
      .map((r) => ({
        ...r,
        paid: r.invoices.reduce((a, i) => a + i.paidAmount, 0),
        due: r.invoices.reduce((a, i) => a + (i.amount - i.paidAmount), 0),
      }))
      .sort((a, b) => b.paid - a.paid)
      .slice(0, 8)
  }, [state.clients, state.invoices])

  const statusColors: Record<string, string> = {
    occupied: VIZ[0], reserved: VIZ[1], available: VIZ[2], maintenance: VIZ[4], inactive: VIZ[3],
  }

  /* Every panel below reads from one of these two, so name the condition
     once rather than repeating the test in five places. */
  const noCharges = state.invoices.length === 0
    ? 'Charges appear here once an agreement has raised some.' : undefined
  const noProperties = state.properties.length === 0
    ? 'Nothing to show until the portfolio has a property in it.' : undefined

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Reports"
        description="Occupancy, revenue, collection performance, overdue exposure and per-property returns."
        actions={
          <>
            <SegmentedControl<Range>
              ariaLabel="Change reporting period"
              value={range}
              onChange={setRange}
              size="sm"
              options={[{ value: '6m', label: '6 months' }, { value: '12m', label: '12 months' }]}
            />
            <Button
              variant="secondary"
              icon={<Download size={15} />}
              disabled={ranked.length === 0}
              onClick={() => {
                const n = exportCsv('altier-property-performance', ranked, [
                  { header: 'Property', value: (r) => r.property.name },
                  { header: 'Code', value: (r) => r.property.code },
                  { header: 'District', value: (r) => r.property.address.district },
                  { header: 'Letting model', value: (r) => MODEL_LABEL[r.property.mode] },
                  { header: 'Status', value: (r) => r.property.status },
                  { header: `Revenue (${state.currency})`, value: (r) => amountIn(r.revenue) },
                  { header: `Maintenance (${state.currency})`, value: (r) => amountIn(r.costs) },
                  { header: `Net (${state.currency})`, value: (r) => amountIn(r.net) },
                  { header: `Outstanding (${state.currency})`, value: (r) => amountIn(r.outstanding) },
                  { header: 'Collection %', value: (r) => Math.round(r.collection * 10) / 10 },
                ])
                toast({
                  title: 'Export downloaded',
                  body: `${num(n)} properties, over the last ${range === '6m' ? 'six' : 'twelve'} months.`,
                  tone: 'success',
                })
              }}
            >
              <span className="hidden sm:inline">Export</span>
            </Button>
          </>
        }
      />

      <motion.div variants={listVariants} initial="initial" animate="animate" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Occupancy rate</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{pct(kpis.occupancyRate, 1)}</p>
          <Meter className="mt-3" value={kpis.occupancyRate ?? 0} tone="good" label="Occupancy rate" />
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Vacancy rate</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{pct(kpis.vacancyRate, 1)}</p>
          <Meter className="mt-3" value={kpis.vacancyRate ?? 0} tone="critical" label="Vacancy rate" />
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Collection rate</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{pct(kpis.collectionRate, 1)}</p>
          <Meter className="mt-3" value={kpis.collectionRate ?? 0} tone="gold" label="Collection rate" />
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Overdue exposure</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-[rgb(var(--c-status-critical))]">{money(kpis.overdueAmount)}</p>
          <p className="mt-3 text-[12px] text-ink-muted">{kpis.overdueCount} invoices across {new Set(state.invoices.filter((i) => i.status === 'overdue').map((i) => i.clientId)).size} clients</p>
        </motion.div>
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartFrame
          className="xl:col-span-2"
          title="Revenue performance"
          empty={noCharges}
          subtitle={`Collected against billed over the last ${range === '6m' ? 'six' : 'twelve'} months. Refundable deposits are excluded from both.`}
          legend={[{ label: 'Collected', color: VIZ[0] }, { label: 'Billed', color: VIZ[1] }]}
          table={
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-ink-muted"><tr className="border-b border-line"><th className="py-2 pr-4 font-medium">Month</th><th className="py-2 pr-4 text-right font-medium">Collected</th><th className="py-2 pr-4 text-right font-medium">Billed</th><th className="py-2 text-right font-medium">Rate</th></tr></thead>
              <tbody className="divide-y divide-[rgb(var(--c-border))]">
                {revenue.map((r) => (
                  <tr key={r.key}>
                    <td className="py-2 pr-4 text-ink-secondary">{r.key}</td>
                    <td className="tnum py-2 pr-4 text-right text-ink">{money(r.collected)}</td>
                    <td className="tnum py-2 pr-4 text-right text-ink-secondary">{money(r.billed)}</td>
                    <td className="tnum py-2 text-right text-ink-secondary">{r.billed ? pct((r.collected / r.billed) * 100) : '—'}</td>
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
            format={(n) => money(n, true)}
            height={252}
          />
        </ChartFrame>

        <ChartFrame
          title="Portfolio composition"
          empty={noProperties}
          subtitle="Where every property currently sits"
          table={
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-ink-muted"><tr className="border-b border-line"><th className="py-2 pr-4 font-medium">Status</th><th className="py-2 text-right font-medium">Count</th></tr></thead>
              <tbody className="divide-y divide-[rgb(var(--c-border))]">
                {mix.map((m) => <tr key={m.status}><td className="py-2 pr-4 text-ink-secondary">{statusLabel(m.status)}</td><td className="tnum py-2 text-right text-ink">{m.count}</td></tr>)}
              </tbody>
            </table>
          }
        >
          <div className="px-3 py-2">
            <DonutChart
              segments={mix.filter((m) => m.count > 0).map((m) => ({ label: statusLabel(m.status), value: m.count, color: statusColors[m.status] }))}
              centerValue={String(kpis.totalProperties)}
              centerLabel="Properties"
              size={162}
            />
          </div>
        </ChartFrame>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <ChartFrame
          title="Earned against money received"
          empty={noCharges}
          subtitle="Each payment is earned across the period it buys, day by day"
          table={
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-ink-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-4 font-medium">Class</th>
                  <th scope="col" className="py-2 text-right font-medium">Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--c-border))]">
                {revenueMix.map((r) => (
                  <tr key={r.label}>
                    <td className="py-2 pr-4 text-ink-secondary">{r.label}</td>
                    <td className="tnum py-2 text-right text-ink">{money(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <div className="pt-2">
            <BarList items={revenueMix} format={(n) => money(n, true)} color={VIZ[0]} />
          </div>
          <p className="mt-4 px-3 text-[11.5px] leading-relaxed text-ink-muted">
            Only the first line is revenue. A tenant paying three months at once, or a guest whose stay
            runs into next month, hands over cash that buys time still to come — recognised as it
            arrives — plus a deposit that is never earned at all.
          </p>
        </ChartFrame>

        <ChartFrame
          title="Revenue by district"
          empty={noCharges}
          subtitle="Collected to date, top eight districts"
          table={
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-ink-muted"><tr className="border-b border-line"><th className="py-2 pr-4 font-medium">District</th><th className="py-2 text-right font-medium">Collected</th></tr></thead>
              <tbody className="divide-y divide-[rgb(var(--c-border))]">
                {byDistrict.map((d) => <tr key={d.label}><td className="py-2 pr-4 text-ink-secondary">{d.label}</td><td className="tnum py-2 text-right text-ink">{money(d.value)}</td></tr>)}
              </tbody>
            </table>
          }
        >
          <div className="pt-2"><BarList items={byDistrict} format={(n) => money(n, true)} color={VIZ[0]} /></div>
        </ChartFrame>

        <ChartFrame
          title="Letting model comparison"
          empty={noProperties}
          subtitle="Revenue against maintenance cost by model"
          legend={[{ label: 'Revenue', color: VIZ[0] }, { label: 'Maintenance', color: VIZ[4] }]}
          table={
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-ink-muted"><tr className="border-b border-line"><th className="py-2 pr-4 font-medium">Model</th><th className="py-2 pr-4 text-right font-medium">Revenue</th><th className="py-2 text-right font-medium">Maintenance</th></tr></thead>
              <tbody className="divide-y divide-[rgb(var(--c-border))]">
                {byModel.map((m) => <tr key={m.label}><td className="py-2 pr-4 text-ink-secondary">{m.label}</td><td className="tnum py-2 pr-4 text-right text-ink">{money(m.revenue)}</td><td className="tnum py-2 text-right text-ink-secondary">{money(m.costs)}</td></tr>)}
              </tbody>
            </table>
          }
        >
          <ColumnChart
            data={byModel}
            xKey="label"
            series={[{ key: 'revenue', label: 'Revenue', color: VIZ[0] }, { key: 'costs', label: 'Maintenance', color: VIZ[4] }]}
            format={(n) => money(n, true)}
            height={218}
          />
        </ChartFrame>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader
          title="Property performance"
          subtitle="Collected revenue, maintenance cost and collection rate per property"
          action={
            <Select value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="Sort property performance" className="w-auto min-w-[168px]">
              <option value="net">Sort: net contribution</option>
              <option value="revenue">Sort: revenue</option>
              <option value="collection">Sort: collection rate</option>
              <option value="outstanding">Sort: outstanding</option>
            </Select>
          }
        />
        <div className="scroll-x mt-3">
          <table className="w-full min-w-[880px] text-left text-[13px]">
            <thead className="text-ink-muted">
              <tr className="border-y border-line bg-surface-inset/50">
                <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Property</th>
                <th scope="col" className="px-4 py-2.5 font-medium">District</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Revenue</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Maintenance</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Net</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Collection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--c-border))]">
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-ink-muted sm:px-6">
                    No properties to rank yet.
                  </td>
                </tr>
              )}
              {ranked.map((r) => (
                <tr key={r.property.id} className="transition-colors hover:bg-surface-inset/60">
                  <td className="px-5 py-3 sm:px-6">
                    <Link to={`/properties/${r.property.id}`} className="font-medium text-ink hover:text-gold">{r.property.name}</Link>
                    <span className="block text-[11.5px] text-ink-muted">{r.property.code} · {r.property.mode === 'short_stay' ? 'Short stay' : r.property.mode === 'rental' ? 'Open rental' : 'Fixed lease'}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{r.property.address.district}</td>
                  <td className="tnum px-4 py-3 text-right text-ink">{money(r.revenue)}</td>
                  <td className="tnum px-4 py-3 text-right text-ink-secondary">{money(r.costs)}</td>
                  <td className={cx('tnum px-4 py-3 text-right font-semibold', r.net >= 0 ? 'text-ink' : 'text-[rgb(var(--c-status-critical))]')}>{money(r.net)}</td>
                  <td className={cx('tnum px-4 py-3 text-right', r.outstanding > 0 ? 'text-[rgb(var(--c-status-critical))]' : 'text-ink-muted')}>{money(r.outstanding)}</td>
                  <td className="px-5 py-3 sm:px-6">
                    <span className="flex items-center gap-2">
                      <Meter value={r.collection} tone={r.collection > 95 ? 'good' : r.collection > 80 ? 'gold' : 'critical'} className="w-20" label={`Collection ${r.collection.toFixed(0)}%`} />
                      <span className="tnum text-[12px] text-ink-secondary">{r.collection.toFixed(0)}%</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-[11.5px] text-ink-muted sm:px-6">
          Revenue counts rent, bookings and fees collected, plus advances. Refundable deposits are
          excluded — they are held on the tenant's behalf, not earned.
        </p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Client activity" subtitle="Most valuable clients by collected revenue" />
          <div className="scroll-x mt-3">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead className="text-ink-muted">
                <tr className="border-y border-line bg-surface-inset/50">
                  <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Client</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Collected</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">Messages</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--c-border))]">
                {clientActivity.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-[13px] text-ink-muted sm:px-6">
                      No clients to rank yet.
                    </td>
                  </tr>
                )}
                {clientActivity.map((r) => (
                  <tr key={r.client.id} className="transition-colors hover:bg-surface-inset/60">
                    <td className="px-5 py-3 sm:px-6">
                      <Link to={`/clients/${r.client.id}`} className="font-medium text-ink hover:text-gold">{r.client.name}</Link>
                    </td>
                    <td className="tnum px-4 py-3 text-right text-ink">{money(r.paid)}</td>
                    <td className={cx('tnum px-4 py-3 text-right', r.due > 0 ? 'text-[rgb(var(--c-status-critical))]' : 'text-ink-muted')}>{money(r.due)}</td>
                    <td className="tnum px-5 py-3 text-right text-ink-secondary sm:px-6">{r.messages}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Overdue ageing" subtitle="Balance outstanding by how late it is" />
          <ul className="mt-3 divide-y divide-[rgb(var(--c-border))]">
            {ageing.map((b) => (
              <li key={b.label} className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
                <span className="text-[13px] text-ink-secondary">{b.label}</span>
                <span className="flex items-center gap-3">
                  <span className="tnum text-[11.5px] text-ink-muted">{b.count} invoices</span>
                  <span className="tnum w-24 text-right text-[13.5px] font-semibold text-ink">{money(b.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-5 py-4 sm:px-6">
            <p className="text-[12px] leading-relaxed text-ink-muted">
              Anything beyond 60 days should move to a formal demand. Altier keeps the ageing clock on the invoice, so the bucket updates itself.
            </p>
          </div>
        </Card>
      </div>
    </>
  )
}
