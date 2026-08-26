import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Coins, Globe2, Moon, Palette, RotateCcw, ShieldCheck, Sun, Users2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import {
  Avatar, Button, Card, CardHeader, Chip, Field, Input, Select, Tabs, Toggle, cx,
} from '../components/ui'
import { ReminderModal } from './Notifications'
import { useStore } from '../lib/store'
import { ROLES, can, roleLabel, type Permission } from '../lib/rbac'
import { mediumDate, money, num } from '../lib/format'
import { BASE_CURRENCY, CURRENCIES, REGIONS, currencyDef, regionDef } from '../lib/money'
import { LANGUAGES, type Language } from '../lib/strings'
import type { Role } from '../lib/types'

type Tab = 'profile' | 'localisation' | 'team' | 'roles' | 'reminders' | 'appearance'

const PERMISSION_ROWS: Array<{ label: string; permission: Permission }> = [
  { label: 'View dashboard', permission: 'view:dashboard' },
  { label: 'View properties', permission: 'view:properties' },
  { label: 'Edit properties', permission: 'edit:properties' },
  { label: 'View bookings & leases', permission: 'view:bookings' },
  { label: 'Edit bookings & leases', permission: 'edit:bookings' },
  { label: 'View clients', permission: 'view:clients' },
  { label: 'Edit clients', permission: 'edit:clients' },
  { label: 'View payments', permission: 'view:payments' },
  { label: 'Record payments', permission: 'edit:payments' },
  { label: 'View maintenance', permission: 'view:maintenance' },
  { label: 'Edit maintenance', permission: 'edit:maintenance' },
  { label: 'View financial figures', permission: 'view:financials' },
  { label: 'View reports', permission: 'view:reports' },
  { label: 'Manage team', permission: 'manage:team' },
]

export default function Settings() {
  const { state, dispatch, theme, toggleTheme, toast } = useStore()
  const [tab, setTab] = useState<Tab>('profile')
  const [tuning, setTuning] = useState(false)
  const me = state.team.find((t) => t.id === state.currentUserId) ?? state.team[0]

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Settings"
        description="Your profile, the team, what each role can reach, how reminders are timed, and how Altier looks."
      />

      <Tabs<Tab>
        ariaLabel="Settings sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'profile', label: 'Profile' },
          { value: 'localisation', label: 'Region & currency' },
          { value: 'team', label: 'Team', count: state.team.length },
          { value: 'roles', label: 'Roles & access' },
          { value: 'reminders', label: 'Reminders' },
          { value: 'appearance', label: 'Appearance' },
        ]}
      />

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="mt-5">
        {tab === 'profile' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="card-pad lg:col-span-2">
              <h3 className="text-[15px] font-semibold text-ink">Your details</h3>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Full name" id="p-name"><Input id="p-name" defaultValue={me.name} /></Field>
                <Field label="Job title" id="p-title"><Input id="p-title" defaultValue={me.title} /></Field>
                <Field label="Email" id="p-email"><Input id="p-email" type="email" defaultValue={me.email} /></Field>
                <Field label="Direct line" id="p-phone"><Input id="p-phone" defaultValue={me.phone} /></Field>
              </div>
              <div className="mt-5 flex justify-end">
                <Button variant="primary" onClick={() => toast({ title: 'Profile saved', tone: 'success' })}>Save changes</Button>
              </div>
            </Card>

            <Card className="card-pad">
              <div className="flex items-center gap-3">
                <Avatar name={me.name} size={52} tone="navy" />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-ink">{me.name}</p>
                  <p className="truncate text-[12.5px] text-ink-muted">{roleLabel(state.role)}</p>
                </div>
              </div>
              <dl className="mt-5 space-y-3 border-t border-line pt-4 text-[12.5px]">
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">With Altier since</dt><dd className="text-ink-secondary">{mediumDate(me.since)}</dd></div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">{state.role === 'owner' ? 'Properties overseen' : 'Properties managed'}</dt>
                  <dd className="text-ink-secondary">
                    {state.role === 'owner'
                      ? state.properties.length
                      : state.properties.filter((p) => p.managerId === me.id).length}
                  </dd>
                </div>
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Access level</dt><dd className="text-ink-secondary">{roleLabel(state.role)}</dd></div>
              </dl>
              <Button
                variant="secondary"
                block
                className="mt-5"
                icon={<RotateCcw size={14} />}
                onClick={() => { dispatch({ type: 'reset' }); toast({ title: 'Demo data reset', body: 'The sample portfolio has been restored to its original state.', tone: 'default' }) }}
              >
                Reset demo data
              </Button>
            </Card>
          </div>
        )}

        {tab === 'localisation' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="card-pad lg:col-span-2">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Globe2 size={16} className="text-gold" /> Where you operate
              </h3>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-secondary">
                Region sets how dates and numbers are written; currency sets what every amount is shown in.
                Choosing a region moves the currency with it, and you can override the currency afterwards.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Region" id="set-region" hint="Controls date and number formatting.">
                  <Select
                    id="set-region"
                    value={state.locale}
                    onChange={(e) => {
                      dispatch({ type: 'set-region', locale: e.target.value })
                      toast({ title: `Region set to ${regionDef(e.target.value).label}`, tone: 'success' })
                    }}
                  >
                    {REGIONS.map((r) => <option key={r.locale} value={r.locale}>{r.label}</option>)}
                  </Select>
                </Field>

                <Field label="Currency" id="set-currency" hint="Every figure in the platform is shown in this currency.">
                  <Select
                    id="set-currency"
                    value={state.currency}
                    onChange={(e) => {
                      dispatch({ type: 'set-currency', currency: e.target.value })
                      toast({ title: `Amounts now shown in ${currencyDef(e.target.value).label}`, tone: 'success' })
                    }}
                  >
                    {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
                  </Select>
                </Field>

                <Field label="Interface language" id="set-language" hint="Sample data stays in the language it was entered.">
                  <Select
                    id="set-language"
                    value={state.language}
                    onChange={(e) => {
                      dispatch({ type: 'set-language', language: e.target.value as Language })
                      toast({ title: `Interface language changed`, tone: 'success' })
                    }}
                  >
                    {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native} — {l.coverage.toLowerCase()}</option>)}
                  </Select>
                </Field>
              </div>

              <div className="mt-6 rounded-xl border border-line bg-surface-inset/60 p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">How it will read</p>
                <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-3">
                  <div>
                    <dt className="text-ink-muted">Monthly rent</dt>
                    <dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">{money(3_500_000)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Portfolio revenue</dt>
                    <dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">{money(842_000_000, true)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Today</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold text-ink">{mediumDate(new Date().toISOString().slice(0, 10))}</dd>
                  </div>
                </dl>
              </div>
            </Card>

            <Card className="card-pad">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Coins size={16} className="text-gold" /> Conversion
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
                The portfolio is priced in Ugandan shillings. Amounts are converted for display only —
                switching currency never rewrites a stored figure.
              </p>
              <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Base currency</dt>
                  <dd className="text-ink-secondary">{BASE_CURRENCY}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Showing</dt>
                  <dd className="text-ink-secondary">{state.currency}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Rate applied</dt>
                  <dd className="tnum text-ink-secondary">
                    {state.currency === BASE_CURRENCY
                      ? 'None — shown as held'
                      : `1 ${state.currency} = ${num(currencyDef(state.currency).ugxPerUnit, currencyDef(state.currency).ugxPerUnit < 10 ? 2 : 0)} UGX`}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 rounded-lg border border-gold/40 bg-gold-soft/40 p-3 text-[11.5px] leading-relaxed text-gold-ink">
                These are indicative demo rates. A live deployment would read them from a rates provider and
                stamp each invoice with the rate used when it was raised, so historic figures never drift.
              </p>
            </Card>
          </div>
        )}

        {tab === 'team' && (
          <Card className="overflow-hidden">
            <CardHeader title="Team" subtitle={`${state.team.length} people with access to this portfolio`} />
            <div className="scroll-x mt-3">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="text-ink-muted">
                  <tr className="border-y border-line bg-surface-inset/50">
                    <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Name</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Title</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Contact</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">Properties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--c-border))]">
                  {state.team.map((t) => (
                    <tr key={t.id} className="transition-colors hover:bg-surface-inset/60">
                      <td className="px-5 py-3 sm:px-6">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={t.name} size={30} tone="soft" />
                          <span className="font-medium text-ink">{t.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">{t.title}</td>
                      <td className="px-4 py-3"><Chip className="bg-gold-soft text-gold-ink">{roleLabel(t.role)}</Chip></td>
                      <td className="px-4 py-3">
                        <span className="block text-ink-secondary">{t.email}</span>
                        <span className="block text-[11.5px] text-ink-muted">{t.phone}</span>
                      </td>
                      <td className="tnum px-5 py-3 text-right text-ink-secondary sm:px-6">
                        {state.properties.filter((p) => p.managerId === t.id).length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === 'roles' && (
          <div className="grid gap-4">
            <Card className="card-pad">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><ShieldCheck size={16} className="text-gold" /> Role-based access</h3>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-secondary">
                Access is enforced across navigation, pages and individual actions. Switch role from the avatar menu at any time —
                the rail, the dashboard figures and the record actions all change with it.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { dispatch({ type: 'set-role', role: r.id }); toast({ title: `Now viewing as ${r.label}`, body: r.blurb }) }}
                    className={cx(
                      'rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-colors',
                      state.role === r.id ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line text-ink-secondary hover:border-line-strong hover:text-ink',
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="Permission matrix" subtitle="What each role can see and do" />
              <div className="scroll-x mt-3">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <thead className="text-ink-muted">
                    <tr className="border-y border-line bg-surface-inset/50">
                      <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Capability</th>
                      {ROLES.map((r) => (
                        <th key={r.id} scope="col" className="px-4 py-2.5 text-center font-medium">{r.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgb(var(--c-border))]">
                    {PERMISSION_ROWS.map((row) => (
                      <tr key={row.permission} className="transition-colors hover:bg-surface-inset/60">
                        <td className="px-5 py-2.5 text-ink-secondary sm:px-6">{row.label}</td>
                        {ROLES.map((r) => {
                          const allowed = can(r.id as Role, row.permission)
                          return (
                            <td key={r.id} className="px-4 py-2.5 text-center">
                              {allowed ? (
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[rgb(var(--c-status-good)/0.14)] text-[rgb(var(--c-status-good))]">
                                  <Check size={12} strokeWidth={3} />
                                  <span className="sr-only">Allowed</span>
                                </span>
                              ) : (
                                <span className="inline-block h-5 w-5 rounded-md bg-surface-inset" aria-label="Not allowed" role="img" />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {tab === 'reminders' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="card-pad lg:col-span-2">
              <h3 className="text-[15px] font-semibold text-ink">Reminder timing</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
                These thresholds decide when something becomes a notification. Change one and the notification centre rebuilds immediately.
              </p>
              <dl className="mt-5 divide-y divide-[rgb(var(--c-border))] text-[13px]">
                {[
                  ['Rent due warning', `${state.reminders.rentDueLeadDays} days before due`],
                  ['Lease expiry warning', `${state.reminders.leaseExpiryLeadDays} days before end of term`],
                  ['Check-in reminder', `${state.reminders.checkInLeadHours} hours before arrival`],
                  ['Vacancy alert', `after ${state.reminders.vacancyAlertDays} days empty`],
                  ['Maintenance deadline', `${state.reminders.maintenanceLeadDays} days before target date`],
                  ['Digest', state.reminders.digest === 'off' ? 'Off' : `${state.reminders.digest} summary`],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-ink-muted">{k}</dt>
                    <dd className="capitalize text-ink-secondary">{v}</dd>
                  </div>
                ))}
              </dl>
              <Button variant="primary" className="mt-5" onClick={() => setTuning(true)}>Adjust timing</Button>
            </Card>

            <Card className="card-pad">
              <h3 className="text-[15px] font-semibold text-ink">Channels</h3>
              <ul className="mt-4 space-y-3.5">
                {([
                  ['inApp', 'In-app'],
                  ['email', 'Email'],
                  ['sms', 'SMS (critical only)'],
                  ['push', 'Mobile push'],
                ] as const).map(([key, label]) => (
                  <li key={key} className="flex items-center justify-between gap-4">
                    <span className="text-[13px] text-ink-secondary">{label}</span>
                    <Toggle
                      checked={state.reminders.channels[key]}
                      onChange={(v) => dispatch({ type: 'update-reminders', reminders: { channels: { ...state.reminders.channels, [key]: v } } })}
                      label={label}
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-5 border-t border-line pt-4">
                <Field label="Digest frequency" id="digest">
                  <Select
                    id="digest"
                    value={state.reminders.digest}
                    onChange={(e) => dispatch({ type: 'update-reminders', reminders: { digest: e.target.value as any } })}
                  >
                    <option value="off">No digest</option>
                    <option value="daily">Daily at 08:00</option>
                    <option value="weekly">Weekly on Monday</option>
                  </Select>
                </Field>
              </div>
            </Card>
          </div>
        )}

        {tab === 'appearance' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="card-pad">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Palette size={16} className="text-gold" /> Theme</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
                Both themes use the same validated palette, stepped for their own surface — charts stay legible and colour-blind safe in either.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {(['light', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { if (theme !== t) toggleTheme() }}
                    className={cx(
                      'rounded-2xl border p-4 text-left transition-all duration-200',
                      theme === t ? 'border-gold ring-2 ring-gold/25' : 'border-line hover:border-line-strong',
                    )}
                  >
                    <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                      {t === 'light' ? <Sun size={15} /> : <Moon size={15} />}
                      {t === 'light' ? 'Ivory' : 'Midnight'}
                    </span>
                    <span className={cx('mt-3 flex h-14 overflow-hidden rounded-lg border border-line', t === 'light' ? 'bg-[#F3EFE7]' : 'bg-[#0A0F17]')}>
                      <span className={cx('w-1/3', t === 'light' ? 'bg-[#0F1620]' : 'bg-[#151C27]')} />
                      <span className="flex-1 p-2">
                        <span className={cx('block h-2 w-3/4 rounded', t === 'light' ? 'bg-[#D8CFBE]' : 'bg-[#283342]')} />
                        <span className="mt-1.5 block h-2 w-1/2 rounded bg-gold/70" />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="card-pad">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Users2 size={16} className="text-gold" /> Accessibility</h3>
              <ul className="mt-4 space-y-3 text-[13px] text-ink-secondary">
                {[
                  'Motion follows your system reduced-motion setting — animation never gates an action.',
                  'Every chart carries a table view, a legend and direct labels; colour never carries meaning alone.',
                  'Keyboard: ⌘K or / opens the command palette, Esc closes any overlay, Tab reaches every control.',
                  'Focus rings are a single gold outline at 2px offset, visible on both themes.',
                  'Status is always paired with a label, never signalled by colour alone.',
                ].map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </motion.div>

      <ReminderModal open={tuning} onClose={() => setTuning(false)} />
    </>
  )
}
