import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useSearchParams } from 'react-router-dom'
import {
  BellRing, CheckCircle2, Download, Receipt, Search, TriangleAlert, Wallet,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader.js'
import { BarList, ChartFrame, VIZ } from '../components/charts'
import {
  Avatar, Button, Card, Chip, Drawer, EmptyState, INVOICE_STATUS_META, InvoiceChip, SearchInput,
  SegmentedControl, Select, cx,
} from '../components/ui'
import { useStore } from '../lib/store.js'
import { can } from '../lib/rbac.js'
import { TODAY, daysBetween, iso } from '../lib/data.js'
import { mediumDate, money, num, relativeDay, shortDate } from '../lib/format.js'
import { exportCsv } from '../lib/csv.js'
import { amountIn } from '../lib/money.js'
import { ageingBuckets, computeKpis } from '../lib/derive.js'
import { itemVariants, listVariants } from '../lib/motion.js'
import type { ChargeType, Invoice, InvoiceStatus } from '../lib/types.js'

export default function Payments() {
  const { state, dispatch, toast } = useStore()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | ChargeType>('all')
  const [sort, setSort] = useState<'due-asc' | 'due-desc' | 'amount-desc'>('due-desc')
  const [openInvoice, setOpenInvoice] = useState<Invoice | null>(null)

  const status = (params.get('status') ?? 'all') as 'all' | InvoiceStatus
  const setStatus = (s: string) => {
    const next = new URLSearchParams(params)
    if (s === 'all') next.delete('status')
    else next.set('status', s)
    setParams(next, { replace: true })
  }

  /* Deep link: /payments?invoice=i-4231 opens the record directly. */
  useEffect(() => {
    const id = params.get('invoice')
    if (!id) return
    const found = state.invoices.find((i) => i.id === id)
    if (found) setOpenInvoice(found)
    const next = new URLSearchParams(params)
    next.delete('invoice')
    setParams(next, { replace: true })
  }, [params, state.invoices, setParams])

  const kpis = useMemo(
    () => computeKpis(state.properties, state.invoices, state.clients, state.maintenance, state.bookings),
    [state],
  )
  const ageing = useMemo(() => ageingBuckets(state.invoices), [state.invoices])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = state.invoices.filter((i) => {
      if (status !== 'all' && i.status !== status) return false
      if (type !== 'all' && i.type !== type) return false
      if (!q) return true
      const p = state.properties.find((x) => x.id === i.propertyId)
      const c = state.clients.find((x) => x.id === i.clientId)
      return `${i.number} ${i.memo} ${p?.name ?? ''} ${c?.name ?? ''}`.toLowerCase().includes(q)
    })
    return [...filtered].sort((a, b) => {
      if (sort === 'amount-desc') return b.amount - a.amount
      if (sort === 'due-asc') return a.dueOn < b.dueOn ? -1 : 1
      return a.dueOn < b.dueOn ? 1 : -1
    })
  }, [state.invoices, state.properties, state.clients, status, type, query, sort])

  const counts = useMemo(() => {
    const by = (s: InvoiceStatus) => state.invoices.filter((i) => i.status === s).length
    return { all: state.invoices.length, paid: by('paid'), pending: by('pending'), overdue: by('overdue'), upcoming: by('upcoming'), partial: by('partial') }
  }, [state.invoices])

  const paidThisMonth = state.invoices
    .filter((i) => i.paidOn?.slice(0, 7) === iso(TODAY).slice(0, 7))
    .reduce((a, i) => a + i.paidAmount, 0)

  const recordPayment = (inv: Invoice) => {
    dispatch({ type: 'record-payment', invoiceId: inv.id })
    toast({ title: `Payment recorded · ${money(inv.amount)}`, body: `${inv.number} marked as paid and applied to the ledger.`, tone: 'success' })
    setOpenInvoice(null)
  }

  /* This records the reminder against the client's thread; it does not
     send anything. Saying "emailed" when no mail server is configured
     would have somebody waiting on a message that never went. */
  const logReminder = (inv: Invoice) => {
    dispatch({ type: 'send-reminder', invoiceId: inv.id })
    const c = state.clients.find((x) => x.id === inv.clientId)
    toast({
      title: 'Reminder logged',
      body: `Recorded on ${c?.name ?? 'the client'}'s file. Send it from your own mail or phone.`,
      tone: 'default',
    })
  }

  const openClient = openInvoice ? state.clients.find((c) => c.id === openInvoice.clientId) : undefined
  const openProperty = openInvoice ? state.properties.find((p) => p.id === openInvoice.propertyId) : undefined

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Payments & invoices"
        description="Rent, bookings, deposits and ancillary charges in one ledger, showing what is paid, pending, overdue and still to come."
        actions={
          <Button
            variant="secondary"
            icon={<Download size={15} />}
            disabled={rows.length === 0}
            onClick={() => {
              /* What is on screen, not the whole ledger: the filters are
                 the point of the export. */
              const n = exportCsv('altier-charges', rows, [
                { header: 'Invoice', value: (i) => i.number },
                { header: 'Status', value: (i) => i.status },
                { header: 'Type', value: (i) => i.type },
                { header: 'Client', value: (i) => state.clients.find((c) => c.id === i.clientId)?.name ?? '' },
                { header: 'Property', value: (i) => state.properties.find((p) => p.id === i.propertyId)?.name ?? '' },
                { header: 'Issued', value: (i) => i.issuedOn },
                { header: 'Due', value: (i) => i.dueOn },
                { header: `Amount (${state.currency})`, value: (i) => amountIn(i.amount) },
                { header: `Paid (${state.currency})`, value: (i) => amountIn(i.paidAmount) },
                { header: `Outstanding (${state.currency})`, value: (i) => amountIn(i.amount - i.paidAmount) },
                { header: 'Method', value: (i) => i.method ?? '' },
                { header: 'Paid on', value: (i) => i.paidOn ?? '' },
                { header: 'Memo', value: (i) => i.memo },
              ])
              toast({ title: 'Export downloaded', body: `${num(n)} charges, as they are filtered here.`, tone: 'success' })
            }}
          >
            Export
          </Button>
        }
      />

      <motion.div variants={listVariants} initial="initial" animate="animate" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div variants={itemVariants} className="card card-pad relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-[3px] bg-status-good" aria-hidden />
          <p className="text-[12.5px] font-medium text-ink-secondary">Collected this month</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{money(paidThisMonth)}</p>
          <p className="mt-2 text-[12px] text-ink-muted">{counts.paid} invoices settled overall</p>
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-[3px] bg-gold" aria-hidden />
          <p className="text-[12.5px] font-medium text-ink-secondary">Pending</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">
            {money(state.invoices.filter((i) => i.status === 'pending').reduce((a, i) => a + i.amount - i.paidAmount, 0))}
          </p>
          <p className="mt-2 text-[12px] text-ink-muted">{counts.pending} awaiting settlement</p>
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-[3px] bg-status-critical" aria-hidden />
          <p className="text-[12.5px] font-medium text-ink-secondary">Overdue</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-[rgb(var(--c-status-critical))]">{money(kpis.overdueAmount)}</p>
          <p className="mt-2 text-[12px] text-ink-muted">{kpis.overdueCount} invoices past due</p>
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-[3px] bg-status-info" aria-hidden />
          <p className="text-[12.5px] font-medium text-ink-secondary">Upcoming 30 days</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{money(kpis.upcomingAmount)}</p>
          <p className="mt-2 text-[12px] text-ink-muted">{kpis.upcomingCount} obligations approaching</p>
        </motion.div>
      </motion.div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <ChartFrame
          title="Overdue balance by age"
          subtitle="How long money has been outstanding"
          empty={state.invoices.length === 0 ? 'Nothing is outstanding, because nothing has been billed yet.' : undefined}
          table={
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-ink-muted"><tr className="border-b border-line"><th className="py-2 pr-4 font-medium">Bucket</th><th className="py-2 pr-4 text-right font-medium">Balance</th><th className="py-2 text-right font-medium">Invoices</th></tr></thead>
              <tbody className="divide-y divide-[rgb(var(--c-border))]">
                {ageing.map((b) => (
                  <tr key={b.label}><td className="py-2 pr-4 text-ink-secondary">{b.label}</td><td className="tnum py-2 pr-4 text-right text-ink">{money(b.amount)}</td><td className="tnum py-2 text-right text-ink-secondary">{b.count}</td></tr>
                ))}
              </tbody>
            </table>
          }
        >
          <div className="pt-2">
            <BarList
              items={ageing.map((b) => ({ label: b.label, value: b.amount, note: `· ${b.count}` }))}
              format={(n) => money(n, true)}
              color={VIZ[4]}
            />
          </div>
        </ChartFrame>

        <Card className="xl:col-span-2">
          <div className="flex flex-col gap-3 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={query} onChange={setQuery} placeholder="Search invoice, memo, client or property…" className="min-w-[220px] flex-1" />
              <Select value={type} onChange={(e) => setType(e.target.value as any)} aria-label="Filter by charge type" className="w-auto min-w-[160px]">
                <option value="all">All charge types</option>
                <option value="rent">Rent</option>
                <option value="booking">Booking</option>
                <option value="deposit">Deposit</option>
                <option value="utilities">Utilities</option>
                <option value="service_fee">Service fee</option>
                <option value="late_fee">Late fee</option>
                <option value="maintenance_recharge">Maintenance recharge</option>
              </Select>
              <Select value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="Sort invoices" className="w-auto min-w-[160px]">
                <option value="due-desc">Sort: newest due</option>
                <option value="due-asc">Sort: oldest due</option>
                <option value="amount-desc">Sort: largest amount</option>
              </Select>
            </div>
            <div className="scroll-x -mx-1 px-1">
              <SegmentedControl
                ariaLabel="Filter by payment status"
                value={status}
                onChange={setStatus}
                size="sm"
                options={[
                  { value: 'all', label: 'All', count: counts.all },
                  { value: 'overdue', label: 'Overdue', count: counts.overdue },
                  { value: 'pending', label: 'Pending', count: counts.pending },
                  { value: 'partial', label: 'Part paid', count: counts.partial },
                  { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
                  { value: 'paid', label: 'Paid', count: counts.paid },
                ]}
              />
            </div>
            <p className="text-[12.5px] text-ink-muted">
              Showing <span className="font-medium text-ink-secondary">{rows.length}</span> of {state.invoices.length} charges
            </p>
          </div>
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card>
          {/* Charges are never typed in directly — they come from agreements,
              so the way out of an empty ledger is to create one. */}
          {state.invoices.length === 0 ? (
            <EmptyState
              icon={<Receipt size={22} />}
              title="The ledger is empty"
              body="Charges are raised by agreements: rent, deposits and advances appear here as soon as one exists."
              action={<Link to="/bookings"><Button variant="secondary">Go to agreements</Button></Link>}
            />
          ) : (
            <EmptyState
              icon={<Search size={22} />}
              title="No charges match"
              body="Nothing in the ledger matches this combination. Clear the status filter or widen the charge type."
              action={<Button variant="secondary" onClick={() => { setQuery(''); setType('all'); setStatus('all') }}>Reset filters</Button>}
            />
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="scroll-x">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className="text-ink-muted">
                <tr className="border-b border-line bg-surface-inset/50">
                  <th scope="col" className="px-5 py-3 font-medium sm:px-6">Invoice</th>
                  <th scope="col" className="px-4 py-3 font-medium">Client</th>
                  <th scope="col" className="px-4 py-3 font-medium">Property</th>
                  <th scope="col" className="px-4 py-3 font-medium">Due</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium sm:px-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--c-border))]">
                {rows.slice(0, 60).map((i) => {
                  const p = state.properties.find((x) => x.id === i.propertyId)
                  const c = state.clients.find((x) => x.id === i.clientId)
                  const late = i.status === 'overdue' ? Math.abs(daysBetween(iso(TODAY), i.dueOn)) : 0
                  return (
                    <tr key={i.id} className="group cursor-pointer transition-colors hover:bg-surface-inset/60" onClick={() => setOpenInvoice(i)}>
                      <td className="px-5 py-3 sm:px-6">
                        <span className="block font-medium text-ink">{i.number}</span>
                        <span className="block truncate text-[11.5px] text-ink-muted">{i.memo}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <Avatar name={c?.name ?? '?'} size={26} tone="soft" />
                          <span className="truncate text-ink-secondary">{c?.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">{p?.name}</td>
                      <td className="px-4 py-3">
                        <span className="block text-ink-secondary">{shortDate(i.dueOn)}</span>
                        <span className={cx('block text-[11.5px]', late > 0 ? 'text-[rgb(var(--c-status-critical))]' : 'text-ink-muted')}>
                          {late > 0 ? `${late} days late` : relativeDay(i.dueOn)}
                        </span>
                      </td>
                      <td className="px-4 py-3"><InvoiceChip status={i.status} /></td>
                      <td className="tnum px-4 py-3 text-right font-semibold text-ink">
                        {money(i.amount)}
                        {i.status === 'partial' && <span className="block text-[11px] font-normal text-ink-muted">{money(i.paidAmount)} received</span>}
                      </td>
                      <td className="px-5 py-3 text-right sm:px-6" onClick={(e) => e.stopPropagation()}>
                        {can(state.role, 'edit:payments') && i.status !== 'paid' ? (
                          <span className="inline-flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => logReminder(i)} title="Log a payment reminder">
                              <BellRing size={14} /><span className="sr-only">Log a reminder for {i.number}</span>
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => recordPayment(i)}>Record</Button>
                          </span>
                        ) : (
                          <span className="text-[12px] text-ink-muted">{i.paidOn ? shortDate(i.paidOn) : '—'}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 60 && (
            <p className="border-t border-line px-5 py-3 text-[12px] text-ink-muted sm:px-6">
              Showing the first 60 of {rows.length} matching charges. Narrow the filters to see the rest.
            </p>
          )}
        </Card>
      )}

      <Drawer
        open={!!openInvoice}
        onClose={() => setOpenInvoice(null)}
        title={openInvoice?.number ?? ''}
        subtitle={openInvoice && <span className="capitalize">{openInvoice.type.replace(/_/g, ' ')} · issued {mediumDate(openInvoice.issuedOn)}</span>}
        footer={
          openInvoice && can(state.role, 'edit:payments') && openInvoice.status !== 'paid' ? (
            <>
              <Button variant="secondary" icon={<BellRing size={14} />} onClick={() => logReminder(openInvoice)}>Log a reminder</Button>
              <Button variant="primary" icon={<CheckCircle2 size={14} />} onClick={() => recordPayment(openInvoice)}>Record payment</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setOpenInvoice(null)}>Close</Button>
          )
        }
      >
        {openInvoice && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-line bg-surface-inset/50 p-5 text-center">
              <p className="text-[11.5px] uppercase tracking-[0.12em] text-ink-muted">Amount due</p>
              <p className="tnum mt-2 text-[34px] font-semibold leading-none text-ink">{money(openInvoice.amount - openInvoice.paidAmount)}</p>
              <div className="mt-3 flex justify-center"><InvoiceChip status={openInvoice.status} /></div>
              {openInvoice.status === 'overdue' && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-[rgb(var(--c-status-critical))]">
                  <TriangleAlert size={13} /> {Math.abs(daysBetween(iso(TODAY), openInvoice.dueOn))} days past the due date
                </p>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-[13px]">
              <Detail label="Client" value={<Link to={`/clients/${openInvoice.clientId}`} className="text-ink hover:text-gold">{openClient?.name}</Link>} />
              <Detail label="Property" value={<Link to={`/properties/${openInvoice.propertyId}`} className="text-ink hover:text-gold">{openProperty?.name}</Link>} />
              <Detail label="Issued" value={mediumDate(openInvoice.issuedOn)} />
              <Detail label="Due" value={`${mediumDate(openInvoice.dueOn)} · ${relativeDay(openInvoice.dueOn)}`} />
              <Detail label="Gross amount" value={money(openInvoice.amount)} />
              <Detail label="Received" value={money(openInvoice.paidAmount)} />
              <Detail label="Method" value={openInvoice.method ? openInvoice.method.replace(/_/g, ' ') : 'Not yet paid'} />
              <Detail label="Settled on" value={openInvoice.paidOn ? mediumDate(openInvoice.paidOn) : '—'} />
            </dl>

            <div>
              <h4 className="text-[13px] font-semibold text-ink">Memo</h4>
              <p className="mt-2 rounded-xl border border-line bg-surface-inset/60 p-3.5 text-[12.5px] leading-relaxed text-ink-secondary">{openInvoice.memo}</p>
            </div>

            <div className="rounded-xl border border-line p-3.5">
              <p className="text-[12px] font-medium text-ink-secondary">Fees and funding</p>
              <ul className="mt-2 space-y-1.5 text-[12px] text-ink-muted">
                <li className="flex justify-between"><span>Processing fee (bank transfer)</span><span className="tnum text-ink-secondary">{money(0)}</span></li>
                <li className="flex justify-between"><span>Expected funding</span><span className="text-ink-secondary">1 business day</span></li>
                <li className="flex justify-between"><span>Paid by</span><span className="text-ink-secondary">Client</span></li>
              </ul>
            </div>
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
      <dd className="mt-1 capitalize text-[13px] text-ink-secondary">{value}</dd>
    </div>
  )
}
