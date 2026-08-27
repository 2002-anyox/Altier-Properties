import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  BellOff, BellRing, CalendarClock, CheckCheck, DoorOpen, FileWarning, Home, Inbox,
  Receipt, Settings2, TriangleAlert, Wrench,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader.js'
import {
  Button, Card, CardHeader, Chip, EmptyState, Field, Modal, SearchInput, SegmentedControl,
  Select, Toggle, cx,
} from '../components/ui'
import { useStore } from '../lib/store.js'
import { relativeDay, shortDate } from '../lib/format.js'
import { itemVariants, listVariants } from '../lib/motion.js'
import type { AppNotification, NotificationKind, NotificationPriority } from '../lib/types.js'

const KIND_META: Record<NotificationKind, { label: string; icon: React.ReactNode }> = {
  payment_due: { label: 'Payment due', icon: <Receipt size={15} /> },
  payment_overdue: { label: 'Overdue', icon: <TriangleAlert size={15} /> },
  lease_expiry: { label: 'Lease expiry', icon: <CalendarClock size={15} /> },
  check_in: { label: 'Check-in', icon: <DoorOpen size={15} /> },
  check_out: { label: 'Check-out', icon: <DoorOpen size={15} /> },
  vacancy: { label: 'Vacancy', icon: <Home size={15} /> },
  maintenance: { label: 'Maintenance', icon: <Wrench size={15} /> },
  document: { label: 'Document', icon: <FileWarning size={15} /> },
  system: { label: 'System', icon: <Inbox size={15} /> },
}

const PRIORITY_META: Record<NotificationPriority, { label: string; chip: string; bar: string }> = {
  critical: { label: 'Critical', chip: 'bg-[rgb(var(--c-status-critical)/0.14)] text-[rgb(var(--c-status-critical))]', bar: 'bg-status-critical' },
  high: { label: 'High', chip: 'bg-[rgb(var(--c-status-serious)/0.16)] text-[rgb(var(--c-status-serious))]', bar: 'bg-status-serious' },
  normal: { label: 'Normal', chip: 'bg-[rgb(var(--c-status-info)/0.12)] text-[rgb(var(--c-status-info))]', bar: 'bg-status-info' },
  low: { label: 'Low', chip: 'bg-surface-inset text-ink-muted', bar: 'bg-line-strong' },
}

const ENTITY_LINK: Record<string, (id: string) => string> = {
  property: (id) => `/properties/${id}`,
  client: (id) => `/clients/${id}`,
  invoice: (id) => `/payments?invoice=${id}`,
  booking: () => '/bookings',
  maintenance: () => '/maintenance',
}

export default function Notifications() {
  const { state, dispatch, toast } = useStore()
  const [read, setRead] = useState<'all' | 'unread' | 'read'>('all')
  const [priority, setPriority] = useState<'all' | NotificationPriority>('all')
  const [kind, setKind] = useState<'all' | NotificationKind>('all')
  const [query, setQuery] = useState('')
  const [tuning, setTuning] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.notifications.filter((n) => {
      if (read === 'unread' && n.read) return false
      if (read === 'read' && !n.read) return false
      if (priority !== 'all' && n.priority !== priority) return false
      if (kind !== 'all' && n.kind !== kind) return false
      if (!q) return true
      return `${n.title} ${n.body}`.toLowerCase().includes(q)
    })
  }, [state.notifications, read, priority, kind, query])

  const unread = state.notifications.filter((n) => !n.read).length
  const critical = state.notifications.filter((n) => n.priority === 'critical').length

  const grouped = useMemo(() => {
    const map = new Map<string, AppNotification[]>()
    rows.forEach((n) => {
      const arr = map.get(n.createdAt) ?? []
      arr.push(n)
      map.set(n.createdAt, arr)
    })
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [rows])

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Notification centre"
        description="Approaching due dates, overdue balances, lease expiries, arrivals, vacancy exposure and maintenance deadlines. Everything that needs a decision, ranked."
        actions={
          <>
            <Button variant="secondary" icon={<Settings2 size={15} />} onClick={() => setTuning(true)}>
              <span className="hidden sm:inline">Reminder timing</span>
            </Button>
            <Button
              variant="primary"
              icon={<CheckCheck size={15} />}
              disabled={unread === 0}
              onClick={() => { dispatch({ type: 'mark-all-read' }); toast({ title: 'All notifications marked read', tone: 'success' }) }}
            >
              <span className="hidden sm:inline">Mark all read</span>
            </Button>
          </>
        }
      />

      <motion.div variants={listVariants} initial="initial" animate="animate" className="mb-4 grid gap-3 sm:grid-cols-3">
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Unread</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{unread}</p>
          <p className="mt-2 text-[12px] text-ink-muted">of {state.notifications.length} total</p>
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-[3px] bg-status-critical" aria-hidden />
          <p className="text-[12.5px] font-medium text-ink-secondary">Critical</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-[rgb(var(--c-status-critical))]">{critical}</p>
          <p className="mt-2 text-[12px] text-ink-muted">need action today</p>
        </motion.div>
        <motion.div variants={itemVariants} className="card card-pad">
          <p className="text-[12.5px] font-medium text-ink-secondary">Reminder lead time</p>
          <p className="tnum mt-2 text-[26px] font-semibold leading-none text-ink">{state.reminders.rentDueLeadDays}d</p>
          <p className="mt-2 text-[12px] text-ink-muted">before a rent charge falls due</p>
        </motion.div>
      </motion.div>

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search notifications…" className="min-w-[220px] flex-1" />
          <Select value={kind} onChange={(e) => setKind(e.target.value as any)} aria-label="Filter by notification type" className="w-auto min-w-[170px]">
            <option value="all">All types</option>
            {Object.entries(KIND_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as any)} aria-label="Filter by priority" className="w-auto min-w-[150px]">
            <option value="all">All priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </Select>
        </div>
        <SegmentedControl
          ariaLabel="Filter by read state"
          value={read}
          onChange={setRead}
          size="sm"
          options={[
            { value: 'all', label: 'All', count: state.notifications.length },
            { value: 'unread', label: 'Unread', count: unread },
            { value: 'read', label: 'Read', count: state.notifications.length - unread },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BellOff size={22} />}
            title={state.notifications.length === 0
              ? 'Nothing needs your attention'
              : unread === 0 && read === 'unread' ? 'You are all caught up' : 'Nothing matches'}
            body={
              state.notifications.length === 0
                ? 'Every alert here is worked out from your own records: due dates approaching, rent lapsing, leases ending, jobs falling behind. Nothing is outstanding.'
                : unread === 0 && read === 'unread'
                  ? 'Every reminder has been read. New alerts appear here as due dates approach and jobs fall behind.'
                  : 'No notifications match this combination of filters. Try widening the type or priority.'
            }
            action={state.notifications.length === 0
              ? undefined
              : <Button variant="secondary" onClick={() => { setRead('all'); setPriority('all'); setKind('all'); setQuery('') }}>Show everything</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => (
            <Card key={date} className="overflow-hidden">
              <div className="flex items-baseline justify-between gap-3 border-b border-line bg-surface-inset/40 px-5 py-2.5 sm:px-6">
                <p className="text-[12px] font-semibold text-ink-secondary">{shortDate(date)}</p>
                <p className="text-[11.5px] text-ink-muted">{relativeDay(date)}</p>
              </div>
              <motion.ul variants={listVariants} initial="initial" animate="animate" className="divide-y divide-[rgb(var(--c-border))]">
                {items.map((n) => {
                  const meta = KIND_META[n.kind]
                  const pri = PRIORITY_META[n.priority]
                  const link = n.entity ? ENTITY_LINK[n.entity.type](n.entity.id) : null
                  return (
                    <motion.li key={n.id} variants={itemVariants} className={cx('relative transition-colors', !n.read && 'bg-gold-soft/25')}>
                      <span className={cx('absolute inset-y-0 left-0 w-[3px]', !n.read ? pri.bar : 'bg-transparent')} aria-hidden />
                      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:px-6">
                        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', pri.chip)} aria-hidden>
                          {meta.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={cx('text-[13.5px]', n.read ? 'font-medium text-ink-secondary' : 'font-semibold text-ink')}>{n.title}</p>
                            <Chip className={pri.chip}>{pri.label}</Chip>
                            <Chip className="bg-surface-inset text-ink-muted">{meta.label}</Chip>
                          </div>
                          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">{n.body}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {link && n.actionLabel && (
                            <Link to={link} onClick={() => dispatch({ type: 'mark-read', id: n.id })}>
                              <Button size="sm" variant="secondary">{n.actionLabel}</Button>
                            </Link>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => dispatch({ type: n.read ? 'mark-unread' : 'mark-read', id: n.id })}
                          >
                            {n.read ? 'Mark unread' : 'Mark read'}
                          </Button>
                        </div>
                      </div>
                    </motion.li>
                  )
                })}
              </motion.ul>
            </Card>
          ))}
        </div>
      )}

      <ReminderModal open={tuning} onClose={() => setTuning(false)} />
    </>
  )
}

export function ReminderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch, toast } = useStore()
  const r = state.reminders
  const set = (patch: Partial<typeof r>) => dispatch({ type: 'update-reminders', reminders: patch })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reminder timing"
      subtitle="Change how far ahead Altier warns you. Notifications rebuild immediately."
      footer={<Button variant="primary" onClick={() => { onClose(); toast({ title: 'Reminder settings saved', tone: 'success' }) }}>Done</Button>}
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rent due warning" id="rem-rent" hint="Days before a charge falls due.">
            <Select id="rem-rent" value={r.rentDueLeadDays} onChange={(e) => set({ rentDueLeadDays: Number(e.target.value) })}>
              {[1, 3, 5, 7, 10, 14].map((d) => <option key={d} value={d}>{d} days</option>)}
            </Select>
          </Field>
          <Field label="Lease expiry warning" id="rem-lease" hint="Time to decide on renewal or re-marketing.">
            <Select id="rem-lease" value={r.leaseExpiryLeadDays} onChange={(e) => set({ leaseExpiryLeadDays: Number(e.target.value) })}>
              {[30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} days</option>)}
            </Select>
          </Field>
          <Field label="Check-in reminder" id="rem-checkin">
            <Select id="rem-checkin" value={r.checkInLeadHours} onChange={(e) => set({ checkInLeadHours: Number(e.target.value) })}>
              {[6, 12, 24, 48, 72].map((h) => <option key={h} value={h}>{h} hours</option>)}
            </Select>
          </Field>
          <Field label="Vacancy alert after" id="rem-vac" hint="Flags empty units losing revenue.">
            <Select id="rem-vac" value={r.vacancyAlertDays} onChange={(e) => set({ vacancyAlertDays: Number(e.target.value) })}>
              {[7, 14, 21, 30, 45].map((d) => <option key={d} value={d}>{d} days</option>)}
            </Select>
          </Field>
        </div>

        <div className="rounded-xl border border-line p-4">
          <p className="text-[12.5px] font-semibold text-ink">Delivery channels</p>
          <ul className="mt-3 space-y-3">
            {([
              ['inApp', 'In-app notification centre'],
              ['email', 'Email digest to the assigned manager'],
              ['sms', 'SMS for critical alerts only'],
              ['push', 'Mobile push'],
            ] as const).map(([key, label]) => (
              <li key={key} className="flex items-center justify-between gap-4">
                <span className="text-[13px] text-ink-secondary">{label}</span>
                <Toggle checked={r.channels[key]} onChange={(v) => set({ channels: { ...r.channels, [key]: v } })} label={label} />
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-line p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[12.5px] font-semibold text-ink">Quiet hours</p>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">Non-critical alerts are held until morning.</p>
            </div>
            <Toggle checked={r.quietHours.enabled} onChange={(v) => set({ quietHours: { ...r.quietHours, enabled: v } })} label="Quiet hours" />
          </div>
          {r.quietHours.enabled && (
            <p className="mt-3 text-[12px] text-ink-secondary">
              Currently {r.quietHours.from} – {r.quietHours.to}. Critical overdue and safety alerts still come through.
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
