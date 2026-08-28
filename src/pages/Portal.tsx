import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarDays, FileText, KeyRound, LogOut, MapPin, Receipt, ShieldCheck,
} from 'lucide-react'
import {
  Button, Card, Chip, EmptyState, Field, Input, InvoiceChip, Toaster,
} from '../components/ui'
import { Wordmark } from '../components/layout/Wordmark.js'
import { useStore } from '../lib/store.js'
import { auth } from '../lib/api.js'
import { TODAY, daysBetween, iso } from '../lib/dates.js'
import { longDate, mediumDate, money } from '../lib/format.js'
import { itemVariants, listVariants } from '../lib/motion.js'
import type { Booking, Invoice } from '../lib/types.js'

/**
 * What a renter sees.
 *
 * Everything on this page is about one person, because that is all the
 * database will hand a tenant login: their agreements, the charges with
 * their name on, and the documents they gave us. There is no portfolio
 * here, no occupancy rate and no maintenance board — a renter has no use
 * for any of it, and until this page existed they were shown all three,
 * including a dashboard that told them a payment needed chasing when they
 * were the one who owed it.
 *
 * It is one page rather than a small app. A tenant opens this a few times
 * a year, to check what is owed and when their stay ends, and navigation
 * would be four clicks in place of a scroll.
 */
export default function Portal() {
  const { state, signOut, toasts, dismissToast } = useStore()
  const me = state.clients[0]
  const today = iso(TODAY)

  const propertyName = (id: string) =>
    state.properties.find((p) => p.id === id)?.name ?? 'Your home'

  /* Current first, then what is coming, then what is done. */
  const { current, upcoming, past } = useMemo(() => {
    const open = (b: Booking) => b.status !== 'cancelled' && b.status !== 'completed'
    const sorted = [...state.bookings].sort((a, b) => (a.start < b.start ? 1 : -1))
    return {
      current: sorted.filter((b) => open(b) && b.start <= today && (!b.end || b.end > today)),
      upcoming: sorted.filter((b) => open(b) && b.start > today),
      past: sorted.filter((b) => !open(b) || (b.end !== null && b.end <= today)),
    }
  }, [state.bookings, today])

  const { owing, settled } = useMemo(() => {
    const outstanding = (i: Invoice) => i.paidAmount < i.amount && i.status !== 'upcoming'
    const byDue = (a: Invoice, b: Invoice) => (a.dueOn < b.dueOn ? -1 : 1)
    return {
      owing: state.invoices.filter(outstanding).sort(byDue),
      settled: state.invoices.filter((i) => !outstanding(i)).sort((a, b) => (a.dueOn < b.dueOn ? 1 : -1)),
    }
  }, [state.invoices])

  const total = owing.reduce((sum, i) => sum + (i.amount - i.paidAmount), 0)
  const overdue = owing.filter((i) => i.dueOn < today)

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line bg-surface-raised">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-5 py-4 sm:px-6">
          {/* The wordmark is drawn for the dark rail, so on a light header it
              needs the rail brought with it. */}
          <span className="rounded-xl bg-surface-rail px-3.5 py-2.5 ring-1 ring-white/10">
            <Wordmark />
          </span>
          <span className="ml-auto text-right">
            <span className="block text-[13px] font-medium text-ink">{state.member?.name}</span>
            <span className="block text-[11.5px] text-ink-muted">{state.member?.email}</span>
          </span>
          <Button size="sm" variant="ghost" icon={<LogOut size={14} />} onClick={() => { void signOut() }}>
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20 pt-8 sm:px-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-gold">
          {longDate(today)}
        </p>
        <h1 className="mt-1.5 font-display text-[26px] font-semibold leading-tight text-ink sm:text-[30px]">
          {greeting()}, {(state.member?.name ?? '').split(' ')[0]}
        </h1>
        <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-secondary">
          {current.length
            ? `You are staying at ${propertyName(current[0]!.propertyId)}.`
            : upcoming.length
              ? `Your next stay begins ${mediumDate(upcoming[0]!.start)}.`
              : 'You have no current agreement with Altier Properties.'}
          {total > 0
            ? ` ${money(total)} is outstanding.`
            : ' Nothing is outstanding.'}
        </p>

        {/* --------------------------- what is owed --------------------- */}
        <section className="mt-8" aria-labelledby="portal-charges">
          <h2 id="portal-charges" className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Receipt size={16} className="text-gold" /> What you owe
          </h2>

          {owing.length === 0 ? (
            <Card className="card-pad">
              <EmptyState
                icon={<ShieldCheck size={20} />}
                title="Nothing outstanding"
                body="Every charge on your account has been settled. Anything new will appear here."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="border-b border-line bg-surface-inset/50 px-5 py-3.5 sm:px-6">
                <p className="tnum font-display text-[22px] font-semibold text-ink">{money(total)}</p>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  across {owing.length} {owing.length === 1 ? 'charge' : 'charges'}
                  {overdue.length ? ` · ${overdue.length} past its due date` : ''}
                </p>
              </div>
              <motion.ul variants={listVariants} initial="hidden" animate="show" className="divide-y divide-[rgb(var(--c-border))]">
                {owing.map((invoice) => (
                  <motion.li key={invoice.id} variants={itemVariants} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{invoice.memo}</span>
                      <span className="block text-[11.5px] text-ink-muted">
                        {propertyName(invoice.propertyId)} · {invoice.number}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="tnum block text-[13.5px] font-medium text-ink">
                        {money(invoice.amount - invoice.paidAmount)}
                      </span>
                      <span className="block text-[11.5px] text-ink-muted">{dueWording(invoice.dueOn, today)}</span>
                    </span>
                    <InvoiceChip status={invoice.status} />
                  </motion.li>
                ))}
              </motion.ul>
              <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-ink-muted sm:px-6">
                Payments are not taken here. Pay the way you agreed with Altier Properties, and
                this page updates once it is recorded.
              </p>
            </Card>
          )}
        </section>

        {/* --------------------------- agreements ----------------------- */}
        <section className="mt-8" aria-labelledby="portal-stays">
          <h2 id="portal-stays" className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <CalendarDays size={16} className="text-gold" /> Your agreements
          </h2>

          {current.length === 0 && upcoming.length === 0 && past.length === 0 ? (
            <Card className="card-pad">
              <EmptyState
                icon={<CalendarDays size={20} />}
                title="Nothing on file yet"
                body="Your agreement will appear here once it is opened."
              />
            </Card>
          ) : (
            <div className="grid gap-3">
              {[...current, ...upcoming].map((booking) => (
                <Stay key={booking.id} booking={booking} name={propertyName(booking.propertyId)} today={today} />
              ))}
              {past.length > 0 && <PastStays stays={past} propertyName={propertyName} />}
            </div>
          )}
        </section>

        {/* --------------------------- documents ------------------------ */}
        <section className="mt-8" aria-labelledby="portal-docs">
          <h2 id="portal-docs" className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <FileText size={16} className="text-gold" /> Your documents
          </h2>
          <Card className="overflow-hidden">
            {(me?.idDocuments ?? []).length === 0 ? (
              <div className="card-pad">
                <EmptyState
                  icon={<FileText size={20} />}
                  title="No documents on file"
                  body="Anything you have given Altier Properties — an ID, a signed agreement — appears here."
                />
              </div>
            ) : (
              <ul className="divide-y divide-[rgb(var(--c-border))]">
                {(me?.idDocuments ?? []).map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-inset text-ink-muted" aria-hidden>
                      <FileText size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink">{doc.name}</span>
                      <span className="block text-[11.5px] text-ink-muted">
                        Added {mediumDate(doc.uploadedAt)} · {doc.sizeKb} KB
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <ChangePassword />

        <p className="mt-8 text-[12px] leading-relaxed text-ink-muted">
          This page shows your records and nobody else&rsquo;s. If something here looks wrong,
          speak to Altier Properties — corrections are made on their side, not yours.
        </p>
      </main>

      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

/* ------------------------------ pieces ----------------------------- */

function Stay({ booking, name, today }: { booking: Booking; name: string; today: string }) {
  const running = booking.start <= today
  const ends = booking.end
  const daysLeft = ends ? daysBetween(today, ends) : null

  return (
    <Card className="card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <MapPin size={14} className="shrink-0 text-ink-muted" /> {name}
          </p>
          <p className="mt-1 text-[12.5px] text-ink-secondary">
            {mediumDate(booking.start)}
            {ends ? ` — ${mediumDate(ends)}` : ' — open-ended'}
          </p>
        </div>
        <Chip className={running ? 'bg-status-good-soft text-status-good' : 'bg-status-info-soft text-status-info'}>
          {running ? 'Current' : 'Upcoming'}
        </Chip>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Detail label={booking.mode === 'short_stay' ? 'Nightly rate' : 'Rent'} value={money(booking.rate)} />
        {booking.deposit > 0 && <Detail label="Deposit held" value={money(booking.deposit)} />}
        {daysLeft !== null && daysLeft >= 0 && (
          <Detail
            label="Ends in"
            value={daysLeft === 0 ? 'Today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`}
          />
        )}
        {booking.noticeDays > 0 && <Detail label="Notice period" value={`${booking.noticeDays} days`} />}
      </dl>

      {booking.notes && (
        <p className="mt-4 rounded-xl border border-line bg-surface-inset/50 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-secondary">
          {booking.notes}
        </p>
      )}
    </Card>
  )
}

function PastStays({
  stays, propertyName,
}: { stays: Booking[]; propertyName: (id: string) => string }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-3.5 text-left text-[13.5px] font-medium text-ink-secondary transition-colors hover:bg-surface-inset/60 hover:text-ink sm:px-6"
      >
        {stays.length} past {stays.length === 1 ? 'stay' : 'stays'}
        <span className="ml-auto text-[12px] text-ink-muted">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ul className="divide-y divide-[rgb(var(--c-border))] border-t border-line">
          {stays.map((booking) => (
            <li key={booking.id} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {propertyName(booking.propertyId)}
              </span>
              <span className="text-[12px] text-ink-muted">
                {mediumDate(booking.start)}{booking.end ? ` — ${mediumDate(booking.end)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-[11.5px] uppercase tracking-[0.08em] text-ink-muted">{label}</dt>
    <dd className="tnum mt-0.5 text-[14px] font-medium text-ink">{value}</dd>
  </div>
)

/** The one thing a tenant can change here: how they get in. */
function ChangePassword() {
  const { state, toast } = useStore()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next.length < 10 || busy) return
    setBusy(true)
    setProblem(null)
    try {
      await auth.changePassword(current, next)
      toast({
        title: 'Password changed',
        body: 'Every other device you were signed in on has been signed out.',
        tone: 'success',
      })
      setOpen(false)
      setCurrent('')
      setNext('')
    } catch (error) {
      setProblem((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8">
      <Card className="card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <KeyRound size={16} className="text-gold" /> Your sign-in
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-secondary">
              {state.member?.email}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
            {open ? 'Cancel' : 'Change password'}
          </Button>
        </div>

        {open && (
          <form onSubmit={submit} className="mt-5 grid gap-4">
            {state.hasPassword && (
              <Field label="Current password" id="pt-current">
                <Input
                  id="pt-current" type="password" autoComplete="current-password"
                  value={current} onChange={(e) => setCurrent(e.target.value)}
                />
              </Field>
            )}
            <Field label="New password" id="pt-next" hint="At least 10 characters. Length beats punctuation.">
              <Input
                id="pt-next" type="password" autoComplete="new-password"
                value={next} onChange={(e) => setNext(e.target.value)}
              />
            </Field>
            {problem && (
              <p role="alert" className="text-[12.5px] text-[rgb(var(--c-status-critical))]">{problem}</p>
            )}
            <Button type="submit" variant="primary" disabled={next.length < 10 || busy}>
              {busy ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        )}
      </Card>
    </section>
  )
}

/* ------------------------------ wording ---------------------------- */

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** "Due in 4 days" reads better than a date somebody has to subtract from. */
function dueWording(dueOn: string, today: string) {
  const gap = daysBetween(today, dueOn)
  if (gap < 0) return `${Math.abs(gap)} ${Math.abs(gap) === 1 ? 'day' : 'days'} overdue`
  if (gap === 0) return 'Due today'
  if (gap === 1) return 'Due tomorrow'
  if (gap <= 30) return `Due in ${gap} days`
  return `Due ${mediumDate(dueOn)}`
}
