import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  CircleDollarSign, Columns3, LayoutList, Plus, Search, Timer, User, Wrench,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import {
  Button, Card, Chip, Drawer, EmptyState, Field, Input, MAINTENANCE_STATUS_META, MaintenanceChip,
  Modal, PRIORITY_META, PriorityChip, SearchInput, SegmentedControl, Select, Textarea, cx,
} from '../components/ui'
import { useStore } from '../lib/store'
import { can } from '../lib/rbac'
import { TODAY, dayOffset, daysBetween, iso } from '../lib/data'
import { mediumDate, money, relativeDay, shortDate } from '../lib/format'
import { itemVariants, listVariants } from '../lib/motion'
import type { MaintenancePriority, MaintenanceRequest, MaintenanceStatus } from '../lib/types'

const COLUMNS: MaintenanceStatus[] = ['reported', 'scheduled', 'in_progress', 'awaiting_parts', 'completed']

export default function Maintenance() {
  const { state, dispatch, toast } = useStore()
  const [view, setView] = useState<'board' | 'list'>('board')
  const [query, setQuery] = useState('')
  const [priority, setPriority] = useState<'all' | MaintenancePriority>('all')
  const [propertyId, setPropertyId] = useState('all')
  const [open, setOpen] = useState<MaintenanceRequest | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ title: '', propertyId: state.properties[0]?.id ?? '', priority: 'medium' as MaintenancePriority, description: '', vendor: 'Tejo Building Services', dueOn: dayOffset(7) })

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.maintenance.filter((m) => {
      if (priority !== 'all' && m.priority !== priority) return false
      if (propertyId !== 'all' && m.propertyId !== propertyId) return false
      if (!q) return true
      const p = state.properties.find((x) => x.id === m.propertyId)
      return `${m.title} ${m.reference} ${m.vendor} ${p?.name ?? ''}`.toLowerCase().includes(q)
    })
  }, [state.maintenance, state.properties, query, priority, propertyId])

  const openJobs = state.maintenance.filter((m) => m.status !== 'completed')
  const overdue = openJobs.filter((m) => daysBetween(iso(TODAY), m.dueOn) < 0)
  const spend = state.maintenance.reduce((a, m) => a + (m.actualCost ?? 0), 0)
  const committed = openJobs.reduce((a, m) => a + m.estimatedCost, 0)

  const createRequest = () => {
    if (!draft.title.trim()) return
    const id = `m-new-${Date.now()}`
    const request: MaintenanceRequest = {
      id,
      reference: `MNT-${3400 + state.maintenance.length}`,
      propertyId: draft.propertyId,
      title: draft.title.trim(),
      description: draft.description.trim() || 'Logged from the maintenance board.',
      category: 'structural',
      priority: draft.priority,
      status: 'reported',
      vendor: draft.vendor,
      trade: 'Building',
      assigneeId: 'tm-06',
      reportedBy: 'You',
      reportedOn: iso(TODAY),
      dueOn: draft.dueOn,
      completedOn: null,
      estimatedCost: 0,
      actualCost: null,
      timeline: [{ at: iso(TODAY), label: 'Request logged', by: 'You' }],
    }
    dispatch({ type: 'add-maintenance', request })
    setCreating(false)
    setDraft({ ...draft, title: '', description: '' })
    toast({ title: 'Maintenance request raised', body: `${request.reference} added to the board.`, tone: 'success' })
  }

  const setStatus = (m: MaintenanceRequest, status: MaintenanceStatus) => {
    dispatch({ type: 'set-maintenance-status', id: m.id, status })
    toast({ title: `${m.reference} moved to ${MAINTENANCE_STATUS_META[status].label.toLowerCase()}`, tone: 'success' })
    setOpen(null)
  }

  const openProperty = open ? state.properties.find((p) => p.id === open.propertyId) : undefined
  const assignee = open ? state.team.find((t) => t.id === open.assigneeId) : undefined

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Maintenance"
        description="Every job from report to sign-off — with priority, vendor, cost and a timeline you can hand to an owner."
        actions={
          <>
            <SegmentedControl
              ariaLabel="Change maintenance view"
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: <span className="inline-flex items-center gap-1.5"><Columns3 size={14} /><span className="hidden sm:inline">Board</span></span> },
                { value: 'list', label: <span className="inline-flex items-center gap-1.5"><LayoutList size={14} /><span className="hidden sm:inline">List</span></span> },
              ]}
            />
            {can(state.role, 'edit:maintenance') && (
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                <span className="hidden sm:inline">Raise job</span>
              </Button>
            )}
          </>
        }
      />

      <motion.div variants={listVariants} initial="initial" animate="animate" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Open jobs</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{openJobs.length}</p>
          <p className="mt-2 text-[12px] text-ink-muted">{openJobs.filter((m) => m.priority === 'urgent').length} urgent</p>
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-[3px] bg-status-critical" aria-hidden />
          <p className="text-[12.5px] font-medium text-ink-secondary">Past due</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-[rgb(var(--c-status-critical))]">{overdue.length}</p>
          <p className="mt-2 text-[12px] text-ink-muted">jobs beyond their target date</p>
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Spend to date</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{money(spend)}</p>
          <p className="mt-2 text-[12px] text-ink-muted">across completed jobs</p>
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Committed</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{money(committed)}</p>
          <p className="mt-2 text-[12px] text-ink-muted">estimated on open jobs</p>
        </motion.div>
      </motion.div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search job, reference, vendor or property…" className="min-w-[220px] flex-1" />
        <Select value={priority} onChange={(e) => setPriority(e.target.value as any)} aria-label="Filter by priority" className="w-auto min-w-[150px]">
          <option value="all">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label="Filter by property" className="w-auto min-w-[180px]">
          <option value="all">All properties</option>
          {state.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search size={22} />}
            title="No jobs match"
            body="Nothing on the board matches this filter. Clear the priority or pick a different property."
            action={<Button variant="secondary" onClick={() => { setQuery(''); setPriority('all'); setPropertyId('all') }}>Reset filters</Button>}
          />
        </Card>
      ) : view === 'board' ? (
        <div className="scroll-x -mx-4 px-4 pb-2 sm:-mx-6 sm:px-6">
          <div className="flex gap-4" style={{ minWidth: 1080 }}>
            {COLUMNS.map((col) => {
              const items = rows.filter((m) => m.status === col)
              return (
                <div key={col} className="flex w-[216px] shrink-0 flex-col">
                  <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
                    <span className="text-[12.5px] font-semibold text-ink">{MAINTENANCE_STATUS_META[col].label}</span>
                    <span className="tnum rounded-full bg-surface-inset px-1.5 py-0.5 text-[10.5px] text-ink-muted">{items.length}</span>
                  </div>
                  <motion.ul variants={listVariants} initial="initial" animate="animate" className="flex flex-col gap-2.5">
                    {items.map((m) => {
                      const p = state.properties.find((x) => x.id === m.propertyId)
                      const late = daysBetween(iso(TODAY), m.dueOn) < 0 && m.status !== 'completed'
                      return (
                        <motion.li key={m.id} variants={itemVariants}>
                          <button
                            onClick={() => setOpen(m)}
                            className="card w-full p-3.5 text-left transition-[transform,box-shadow] duration-300 ease-premium hover:-translate-y-0.5 hover:shadow-lift"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <PriorityChip priority={m.priority} />
                              <span className="tnum shrink-0 text-[10.5px] text-ink-muted">{m.reference}</span>
                            </div>
                            <p className="mt-2.5 text-[13px] font-medium leading-snug text-ink">{m.title}</p>
                            <p className="mt-1 truncate text-[11.5px] text-ink-muted">{p?.name}</p>
                            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
                              <span className={cx('inline-flex items-center gap-1 text-[11px]', late ? 'text-[rgb(var(--c-status-critical))]' : 'text-ink-muted')}>
                                <Timer size={11} /> {shortDate(m.dueOn)}
                              </span>
                              <span className="tnum text-[11px] text-ink-muted">{money(m.actualCost ?? m.estimatedCost, 'EUR', true)}</span>
                            </div>
                          </button>
                        </motion.li>
                      )
                    })}
                    {items.length === 0 && (
                      <li className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-[11.5px] text-ink-muted">
                        Nothing here
                      </li>
                    )}
                  </motion.ul>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="scroll-x">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className="text-ink-muted">
                <tr className="border-b border-line bg-surface-inset/50">
                  <th scope="col" className="px-5 py-3 font-medium sm:px-6">Job</th>
                  <th scope="col" className="px-4 py-3 font-medium">Property</th>
                  <th scope="col" className="px-4 py-3 font-medium">Vendor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Priority</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Due</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium sm:px-6">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--c-border))]">
                {rows.map((m) => {
                  const p = state.properties.find((x) => x.id === m.propertyId)
                  const late = daysBetween(iso(TODAY), m.dueOn) < 0 && m.status !== 'completed'
                  return (
                    <tr key={m.id} className="cursor-pointer transition-colors hover:bg-surface-inset/60" onClick={() => setOpen(m)}>
                      <td className="px-5 py-3 sm:px-6">
                        <span className="block font-medium text-ink">{m.title}</span>
                        <span className="block text-[11.5px] text-ink-muted">{m.reference} · {m.trade}</span>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">{p?.name}</td>
                      <td className="px-4 py-3 text-ink-secondary">{m.vendor}</td>
                      <td className="px-4 py-3"><PriorityChip priority={m.priority} /></td>
                      <td className="px-4 py-3"><MaintenanceChip status={m.status} /></td>
                      <td className={cx('px-4 py-3', late ? 'text-[rgb(var(--c-status-critical))]' : 'text-ink-secondary')}>{shortDate(m.dueOn)}</td>
                      <td className="tnum px-5 py-3 text-right font-semibold text-ink sm:px-6">{money(m.actualCost ?? m.estimatedCost)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* --------------------------- Job detail drawer -------------------------- */}
      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.title ?? ''}
        subtitle={open && <span>{open.reference} · {open.trade} · reported {relativeDay(open.reportedOn)}</span>}
        footer={
          open && can(state.role, 'edit:maintenance') ? (
            <>
              <Select
                value={open.status}
                onChange={(e) => setStatus(open, e.target.value as MaintenanceStatus)}
                aria-label="Change job status"
                className="w-auto min-w-[170px]"
              >
                {COLUMNS.map((c) => <option key={c} value={c}>{MAINTENANCE_STATUS_META[c].label}</option>)}
              </Select>
              <Button variant="primary" onClick={() => setStatus(open, 'completed')} disabled={open.status === 'completed'}>
                Mark complete
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setOpen(null)}>Close</Button>
          )
        }
      >
        {open && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <PriorityChip priority={open.priority} />
              <MaintenanceChip status={open.status} />
              <Chip className="bg-surface-inset text-ink-secondary capitalize">{open.category}</Chip>
            </div>

            <p className="text-[13.5px] leading-relaxed text-ink-secondary">{open.description}</p>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-[13px]">
              <Detail label="Property" value={<Link to={`/properties/${open.propertyId}`} className="text-ink hover:text-gold">{openProperty?.name}</Link>} />
              <Detail label="Reported by" value={open.reportedBy} />
              <Detail label="Vendor" value={open.vendor} />
              <Detail label="Assigned to" value={assignee?.name ?? '—'} />
              <Detail label="Reported" value={mediumDate(open.reportedOn)} />
              <Detail label="Target date" value={`${mediumDate(open.dueOn)} · ${relativeDay(open.dueOn)}`} />
              <Detail label="Estimate" value={money(open.estimatedCost)} />
              <Detail label="Actual cost" value={open.actualCost !== null ? money(open.actualCost) : 'Not yet invoiced'} />
            </dl>

            <div>
              <h4 className="flex items-center gap-2 text-[13px] font-semibold text-ink"><Timer size={14} className="text-ink-muted" /> Timeline</h4>
              <ol className="mt-3">
                {open.timeline.map((t, i, arr) => (
                  <li key={`${t.at}-${i}`} className="relative flex gap-3.5 pb-4 last:pb-0">
                    <span className="relative flex flex-col items-center">
                      <span className={cx('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', i === arr.length - 1 ? 'bg-gold' : 'bg-line-strong')} />
                      {i < arr.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-ink">{t.label}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-muted">{mediumDate(t.at)} · {t.by}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Drawer>

      {/* ------------------------------ New job modal --------------------------- */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Raise a maintenance job"
        subtitle="It lands in Reported and can be triaged from the board."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" onClick={createRequest} disabled={!draft.title.trim()}>Create job</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="What needs doing" id="job-title">
            <Input id="job-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Replace failed extractor fan" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Property" id="job-prop">
              <Select id="job-prop" value={draft.propertyId} onChange={(e) => setDraft({ ...draft, propertyId: e.target.value })}>
                {state.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Priority" id="job-priority">
              <Select id="job-priority" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as MaintenancePriority })}>
                {(Object.keys(PRIORITY_META) as MaintenancePriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
              </Select>
            </Field>
            <Field label="Vendor" id="job-vendor">
              <Input id="job-vendor" value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} />
            </Field>
            <Field label="Target date" id="job-due">
              <Input id="job-due" type="date" value={draft.dueOn} onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })} />
            </Field>
          </div>
          <Field label="Detail" id="job-desc" hint="Anything the vendor needs to know before attending.">
            <Textarea id="job-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Access notes, symptoms, parts already tried…" />
          </Field>
        </div>
      </Modal>
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
