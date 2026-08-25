import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import {
  BadgeCheck, Building2, Download, FileText, Mail, MessageSquare, NotebookPen, Phone,
  Receipt, Send, Star, Users,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import {
  Avatar, Button, Card, CardHeader, Chip, EmptyState, InvoiceChip, Meter, StatusChip, Tabs,
  Textarea, cx,
} from '../components/ui'
import { useStore } from '../lib/store'
import { can } from '../lib/rbac'
import { mediumDate, money, relativeDay, shortDate } from '../lib/format'
import { itemVariants, listVariants } from '../lib/motion'

type Tab = 'overview' | 'agreements' | 'payments' | 'documents' | 'communications'

export default function ClientDetail() {
  const { id = '' } = useParams()
  const { state, dispatch, toast } = useStore()
  const [tab, setTab] = useState<Tab>('overview')
  const [note, setNote] = useState('')

  const client = state.clients.find((c) => c.id === id)
  const bookings = useMemo(
    () => state.bookings.filter((b) => b.clientId === id).sort((a, b) => (a.start < b.start ? 1 : -1)),
    [state.bookings, id],
  )
  const invoices = useMemo(
    () => state.invoices.filter((i) => i.clientId === id).sort((a, b) => (a.dueOn < b.dueOn ? 1 : -1)),
    [state.invoices, id],
  )

  if (!client) {
    return (
      <Card>
        <EmptyState icon={<Users size={22} />} title="Client not found" body="That client record is no longer available." action={<Link to="/clients"><Button variant="secondary">Back to clients</Button></Link>} />
      </Card>
    )
  }

  const properties = client.propertyIds.map((pid) => state.properties.find((p) => p.id === pid)).filter(Boolean)
  const paid = invoices.filter((i) => i.status === 'paid').reduce((a, i) => a + i.paidAmount, 0)
  const outstanding = invoices.reduce((a, i) => a + (i.amount - i.paidAmount), 0)
  const onTime = invoices.filter((i) => i.status === 'paid').length
  const settled = invoices.filter((i) => i.status !== 'upcoming').length
  const reliability = settled ? (onTime / settled) * 100 : 100

  const addNote = () => {
    if (!note.trim()) return
    dispatch({ type: 'add-note', clientId: client.id, text: note.trim() })
    setNote('')
    toast({ title: 'Note added to the client record', tone: 'success' })
  }

  const tabs: Array<{ value: Tab; label: string; count?: number }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'agreements', label: 'Agreements', count: bookings.length },
    ...(can(state.role, 'view:payments') ? [{ value: 'payments' as Tab, label: 'Payments', count: invoices.length }] : []),
    { value: 'documents', label: 'Documents', count: client.idDocuments.length },
    { value: 'communications', label: 'Communications', count: client.communications.length },
  ]

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Clients', to: '/clients' }, { label: client.name }]}
        title={client.name}
        description={`${client.kind === 'corporate' ? 'Corporate account' : client.kind === 'guest' ? 'Short-stay guest' : 'Tenant'} · client since ${mediumDate(client.since)} · ${client.nationality}`}
        actions={
          <>
            <Button variant="secondary" icon={<Phone size={15} />}>Call</Button>
            <Button variant="primary" icon={<Mail size={15} />} onClick={() => toast({ title: 'Composer opened', body: `A message to ${client.name} would be drafted here.` })}>
              Message
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="card-pad lg:col-span-1">
          <div className="flex items-center gap-3">
            <Avatar name={client.name} size={52} tone="navy" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-ink">{client.name}</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-ink-muted">
                <Star size={11} className="fill-gold text-gold" /> {client.rating.toFixed(1)} · {client.status}
              </p>
            </div>
          </div>
          <dl className="mt-5 space-y-3 border-t border-line pt-4 text-[12.5px]">
            <div><dt className="text-ink-muted">Email</dt><dd className="mt-0.5 truncate text-ink-secondary">{client.email}</dd></div>
            <div><dt className="text-ink-muted">Phone</dt><dd className="mt-0.5 text-ink-secondary">{client.phone}</dd></div>
            <div><dt className="text-ink-muted">Emergency contact</dt><dd className="mt-0.5 text-ink-secondary">{client.emergencyContact}</dd></div>
          </dl>
        </Card>

        <motion.div variants={listVariants} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-3 lg:col-span-3">
          <motion.div variants={itemVariants} className="card card-pad">
            <p className="text-[12.5px] font-medium text-ink-secondary">Lifetime value</p>
            <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{money(client.lifetimeValue)}</p>
            <p className="mt-2 text-[12px] text-ink-muted">{money(paid)} collected in this system</p>
          </motion.div>
          <motion.div variants={itemVariants} className="card card-pad">
            <p className="text-[12.5px] font-medium text-ink-secondary">Outstanding</p>
            <p className={cx('tnum mt-2 text-[26px] font-semibold leading-none', outstanding > 0 ? 'text-[rgb(var(--c-status-critical))]' : 'text-ink')}>{money(outstanding)}</p>
            <p className="mt-2 text-[12px] text-ink-muted">{invoices.filter((i) => i.status === 'overdue').length} invoices overdue</p>
          </motion.div>
          <motion.div variants={itemVariants} className="card card-pad">
            <p className="text-[12.5px] font-medium text-ink-secondary">Payment reliability</p>
            <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{reliability.toFixed(0)}%</p>
            <Meter className="mt-3" value={reliability} tone={reliability > 90 ? 'good' : reliability > 70 ? 'gold' : 'critical'} label="Payment reliability" />
          </motion.div>
        </motion.div>
      </div>

      <div className="mt-6">
        <Tabs<Tab> ariaLabel="Client sections" value={tab} onChange={setTab} tabs={tabs} />
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="mt-5">
        {tab === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Associated properties" subtitle={`${properties.length} properties linked to this client`} />
              {properties.length === 0 ? (
                <EmptyState icon={<Building2 size={20} />} title="No properties linked" body="This client has no active or historic agreement against a property yet." />
              ) : (
                <ul className="mt-3 divide-y divide-[rgb(var(--c-border))]">
                  {properties.map((p) => (
                    <li key={p!.id}>
                      <Link to={`/properties/${p!.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-inset/60 sm:px-6">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium text-ink">{p!.name}</span>
                          <span className="block truncate text-[12px] text-ink-muted">{p!.address.district} · {money(p!.price)}{p!.mode === 'short_stay' ? '/night' : '/month'}</span>
                        </span>
                        <StatusChip status={p!.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="card-pad">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><NotebookPen size={15} className="text-ink-muted" /> Internal notes</h3>
              <p className="mt-3 rounded-xl border border-line bg-surface-inset/60 p-3.5 text-[13px] leading-relaxed text-ink-secondary">{client.notes}</p>
              {can(state.role, 'edit:clients') && (
                <div className="mt-4">
                  <label htmlFor="new-note" className="text-[12px] font-medium text-ink-secondary">Add a note</label>
                  <Textarea id="new-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible to the Altier team only…" className="mt-1.5" />
                  <Button variant="primary" size="sm" className="mt-2.5" icon={<Send size={13} />} onClick={addNote} disabled={!note.trim()}>
                    Save note
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}

        {tab === 'agreements' && (
          <Card className="overflow-hidden">
            <CardHeader title="Leases & bookings" subtitle="Every agreement this client holds or has held" />
            {bookings.length === 0 ? (
              <EmptyState icon={<FileText size={20} />} title="No agreements" body="Nothing has been signed with this client yet." />
            ) : (
              <div className="scroll-x mt-3">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="text-ink-muted">
                    <tr className="border-y border-line bg-surface-inset/50">
                      <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Reference</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Property</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Model</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Term</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                      <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgb(var(--c-border))]">
                    {bookings.map((b) => {
                      const p = state.properties.find((x) => x.id === b.propertyId)
                      return (
                        <tr key={b.id} className="transition-colors hover:bg-surface-inset/60">
                          <td className="px-5 py-3 font-medium text-ink sm:px-6">{b.reference}</td>
                          <td className="px-4 py-3">
                            <Link to={`/properties/${b.propertyId}`} className="text-ink-secondary hover:text-gold">{p?.name}</Link>
                          </td>
                          <td className="px-4 py-3 text-ink-secondary">{b.mode === 'short_stay' ? 'Short stay' : b.mode === 'rental' ? 'Open-ended rental' : 'Fixed-term lease'}</td>
                          <td className="px-4 py-3 text-ink-secondary">
                            {shortDate(b.start)} – {b.end ? shortDate(b.end) : <span className="text-gold">open-ended</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Chip className={
                              b.status === 'in_progress' ? 'bg-gold-soft text-gold-ink'
                                : b.status === 'upcoming' ? 'bg-[rgb(var(--c-status-info)/0.12)] text-[rgb(var(--c-status-info))]'
                                  : b.status === 'cancelled' ? 'bg-[rgb(var(--c-status-critical)/0.12)] text-[rgb(var(--c-status-critical))]'
                                    : 'bg-surface-inset text-ink-secondary'
                            }>
                              {b.status.replace(/_/g, ' ')}
                            </Chip>
                          </td>
                          <td className="tnum px-5 py-3 text-right font-semibold text-ink sm:px-6">
                            {money(b.rate)}<span className="ml-1 text-[11px] font-normal text-ink-muted">{b.mode === 'short_stay' ? '/n' : '/m'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {tab === 'payments' && (
          <Card className="overflow-hidden">
            <CardHeader title="Payment history" subtitle={`${invoices.length} charges · ${money(outstanding)} outstanding`} />
            <div className="scroll-x mt-3">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="text-ink-muted">
                  <tr className="border-y border-line bg-surface-inset/50">
                    <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Invoice</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Memo</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Method</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--c-border))]">
                  {invoices.map((i) => (
                    <tr key={i.id} className="transition-colors hover:bg-surface-inset/60">
                      <td className="px-5 py-3 font-medium text-ink sm:px-6">{i.number}</td>
                      <td className="px-4 py-3 text-ink-secondary">{i.memo}</td>
                      <td className="px-4 py-3 text-ink-secondary">{shortDate(i.dueOn)}</td>
                      <td className="px-4 py-3 capitalize text-ink-secondary">{i.method?.replace(/_/g, ' ') ?? '—'}</td>
                      <td className="px-4 py-3"><InvoiceChip status={i.status} /></td>
                      <td className="tnum px-5 py-3 text-right font-semibold text-ink sm:px-6">{money(i.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === 'documents' && (
          <Card>
            <CardHeader
              title="Identity & supporting documents"
              subtitle="Uploaded during onboarding and verification"
              action={<Button size="sm" variant="secondary" icon={<Download size={14} />}>Download all</Button>}
            />
            <ul className="mt-3 divide-y divide-[rgb(var(--c-border))]">
              {client.idDocuments.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-ink"><BadgeCheck size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{d.name}</span>
                    <span className="block truncate text-[11.5px] text-ink-muted">Verified · {(d.sizeKb / 1024).toFixed(1)} MB · uploaded {mediumDate(d.uploadedAt)}</span>
                  </span>
                  <Button size="sm" variant="ghost" icon={<Download size={14} />}><span className="sr-only">Download {d.name}</span></Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab === 'communications' && (
          <Card>
            <CardHeader title="Communication history" subtitle="Email, calls, SMS, portal messages and internal notes in one thread" />
            <ol className="mt-4 px-5 pb-6 sm:px-6">
              {client.communications.map((c, i, arr) => (
                <li key={c.id} className="relative flex gap-4 pb-5 last:pb-0">
                  <span className="relative flex flex-col items-center">
                    <span className={cx(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-[rgb(var(--c-surface-card))]',
                      c.direction === 'inbound' ? 'bg-gold-soft text-gold-ink' : 'bg-surface-inset text-ink-secondary',
                    )}>
                      {c.channel === 'call' ? <Phone size={13} /> : c.channel === 'note' ? <NotebookPen size={13} /> : c.channel === 'sms' ? <MessageSquare size={13} /> : <Mail size={13} />}
                    </span>
                    {i < arr.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[13.5px] font-medium text-ink">{c.subject}</p>
                      <p className="text-[11.5px] text-ink-muted">{shortDate(c.at)} · {relativeDay(c.at)}</p>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">{c.preview}</p>
                    <p className="mt-1.5 text-[11.5px] capitalize text-ink-muted">{c.channel} · {c.direction} · {c.author}</p>
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
