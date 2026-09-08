import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight, Bell, Building2, CalendarRange, Check, ChevronDown, FileText, Gauge,
  KeyRound, LineChart, Lock, Menu, Receipt, ShieldCheck, Users, Wrench, X,
} from 'lucide-react'
import { Wordmark } from '../components/layout/Wordmark.js'
import { Reveal, RevealGroup, revealItem } from '../components/landing/Reveal.js'
import {
  CalendarPreview, ClientPreview, DashboardPreview, Frame, PaymentsPreview, TeamPreview,
} from '../components/landing/Mockups.js'
import { cx, useEscape } from '../components/ui'
import { goTo } from '../lib/hash.js'
import { seatsLabel } from '../lib/plans.js'
import { EASE } from '../lib/motion.js'

/* ------------------------------------------------------------------ *
 * The front door
 *
 * Everything here is the app's own vocabulary: the same tokens, the same
 * radii, Fraunces over Inter, one gold accent used sparingly, and the
 * eight-pixel rise on the one easing curve. A landing page that looks
 * like a different product than the one behind it is a promise broken
 * before anybody has signed in.
 *
 * PRICES ARE PLACEHOLDERS — see PLANS below. The seat numbers are real
 * (they match server/workspace.ts); the money is not.
 * ------------------------------------------------------------------ */

/* --------------------------- smooth scroll -------------------------- */

/* Anchors move the page rather than the address: the app routes on the
   hash, and leaving "#pricing" in the bar would be a route nobody owns.
   The href stays for the keyboard, the middle click and no-JS. */
const scrollTo = (id: string) => (e: React.MouseEvent) => {
  const target = document.getElementById(id)
  if (!target) return
  e.preventDefault()
  /* The stylesheet flattens CSS scroll-behavior under reduced motion, but
     it cannot reach a behaviour passed in JavaScript. Asked here instead. */
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  /* Focus follows the scroll, so the next Tab continues from the section
     that was jumped to rather than from the top of the page. */
  target.focus({ preventScroll: true })
}

/* ------------------------------ content ---------------------------- */

const FEATURES = [
  {
    icon: Building2,
    title: 'Property and unit management',
    body: 'Hold apartments, houses, villas, serviced flats, short-stay listings and commercial space in a single portfolio. Each property carries its own letting model, rent or nightly rate, assigned manager, amenities, photographs and paperwork, so everything about a unit lives in one record rather than four.',
  },
  {
    icon: CalendarRange,
    title: 'Vacancy and occupancy tracking',
    body: 'A live calendar sets every unit against every night, marked by whether it is let, reserved, free, or being turned around between guests. Because a unit is held by its agreement rather than by a note somebody made, you can see precisely when each one comes free and let it again before it stands empty.',
  },
  {
    icon: Users,
    title: 'Tenant, guest and client profiles',
    body: 'One record for each tenant, guest, corporate account or property owner, holding their contact details, identity documents, the home they occupy, the terms they agreed, every charge raised against them and the history of your correspondence. Any client can be given a portal login to their own records.',
  },
  {
    icon: Receipt,
    title: 'Rent, invoice and payment tracking',
    body: 'Charges take their figures from the property itself, so an agreement cannot quietly bill somebody the wrong rent. Rent, advances, deposits, booking fees, utilities, service charges, late fees and maintenance recharges each have their own type, and payments are recorded against them by bank transfer, card, mobile money or cash.',
  },
  {
    icon: Bell,
    title: 'Due-date reminders and notifications',
    body: 'Decide how much warning you want for rent falling due, a lease approaching its end, a guest arriving or departing, a unit standing empty, or a job nearing its target date. Altier raises each one on that schedule, and observes quiet hours if you would rather not hear from it in the evening.',
  },
  {
    icon: KeyRound,
    title: 'Booking and short-stay management',
    body: 'A three-night stay and a twelve-month lease are the same kind of record, and the form asks only for what that kind of agreement actually needs. Bookings record where they came from, whether direct, Airbnb, Booking.com, an agency or a corporate account, and your team can check guests in and out from the booking list itself.',
  },
  {
    icon: Wrench,
    title: 'Maintenance requests and task tracking',
    body: 'Log a job against a property, give it a category and a priority, assign it to a colleague and set a target date. What the work was expected to cost is kept separate from what it finally came to, and every change is recorded on the job\u2019s own timeline for whoever picks it up next.',
  },
  {
    icon: ShieldCheck,
    title: 'Team roles and secure workspace access',
    body: 'Invite colleagues as owners, managers, accountants or staff, and assign managers and staff to the particular properties they look after. The permission grid is yours to edit, and the database enforces whatever it says, so a role you narrow here is narrowed everywhere.',
  },
  {
    icon: LineChart,
    title: 'Reporting, revenue and occupancy analytics',
    body: 'Revenue is recognised across the period each payment buys rather than on the day it arrives, so a quarterly advance is earned over its three months. Reports cover collection rates per property, revenue by district, letting model against maintenance cost, your most valuable clients, and how far overdue each outstanding balance has become.',
  },
  {
    icon: FileText,
    title: 'Documents and property records',
    body: 'Leases, title deeds, insurance certificates, inspection reports, compliance papers, invoices and identity documents are filed against the property or the person they belong to. When somebody needs one months later, it is where it ought to be rather than on a colleague\u2019s laptop.',
  },
]

const OUTCOMES = [
  {
    value: 'One place',
    label: 'A single source of truth',
    body: 'The spreadsheet, the WhatsApp thread, the paper file and the calendar somebody keeps in their head all describe the same portfolio slightly differently. Altier replaces them with one record your whole team works from.',
  },
  {
    value: 'Nothing missed',
    label: 'No rent left uninvoiced',
    body: 'Every charge carries its own due date and chases itself, so arrears appear as a figure you can act on this week rather than something you discover at the end of the quarter.',
  },
  {
    value: 'Fewer empty days',
    label: 'Stronger occupancy',
    body: 'A unit coming free is visible weeks in advance, which gives you the time to find and sign the next tenant before the current one has moved their furniture out.',
  },
  {
    value: 'Always current',
    label: 'Accurate as you work',
    body: 'Every change is written to the database and confirmed on screen as you make it, so the figures you are reading are the ones that are stored, not the ones your browser hoped had saved.',
  },
]

const STEPS = [
  {
    title: 'Create your workspace',
    body: 'Your workspace is private to you and opens completely empty, with no sample records to clear out before you can begin. Nothing in it is visible to any other customer on the platform.',
  },
  {
    title: 'Add your properties and units',
    body: 'Give each property a name, a letting model, a rent or nightly rate, and a pin on the map. The rate you set becomes the figure that every agreement and every invoice raised against that property will use.',
  },
  {
    title: 'Invite your team and add clients',
    body: 'Send your colleagues an invitation and choose the role each of them holds. Tenants and guests can be given portal access to their own records, and they never count against your seat allowance.',
  },
  {
    title: 'Track occupancy, payments and activity',
    body: 'Occupancy, payments, arrivals, maintenance and documents all move as your team works, in one live picture. Nothing needs to be reconciled at the end of the month, because nothing was ever kept in two places.',
  },
]

const SHOWCASE = [
  { id: 'dashboard', label: 'Dashboard', file: 'Altier Properties — Dashboard', render: () => <DashboardPreview />, note: 'The state of the whole portfolio on one screen: occupancy, rent collected, units ready to let, and what falls due over the coming week.' },
  { id: 'calendar', label: 'Availability', file: 'Altier Properties — Availability', render: () => <CalendarPreview />, note: 'Every unit set against every night, so you can see at a glance what is let, what is reserved, and exactly where the gaps fall.' },
  { id: 'client', label: 'Client', file: 'Altier Properties — A. Mugisha', render: () => <ClientPreview />, note: 'A single view of one client: the home they occupy, the terms they agreed, and every charge that has been raised against them.' },
  { id: 'payments', label: 'Payments', file: 'Altier Properties — Payments', render: () => <PaymentsPreview />, note: 'What has been collected, what is still outstanding, and which invoices are due to be chased next.' },
  { id: 'team', label: 'Team', file: 'Altier Properties — Team & access', render: () => <TeamPreview />, note: 'The permissions held by each role, edited by you and enforced by the database rather than by the interface.' },
]

/* PLACEHOLDER PRICING — the money is invented and must be set before this
   goes in front of anybody.
   
   The seat counts are not invented: they come from src/lib/plans.ts, the
   same definition the server reads when it refuses an invitation past the
   limit, so this page cannot promise a seat the product will not give.
   
   Properties are deliberately unlimited on every plan. The product meters
   seats, not properties, and advertising a cap it does not enforce would
   be a promise the app does not keep — if you want property limits, they
   have to exist in the code before they appear here. */
const PLANS = [
  {
    name: 'Starter',
    price: '$29',
    cadence: 'per month',
    blurb: 'For a landlord managing a handful of properties.',
    seats: seatsLabel('starter'),
    featured: false,
    includes: [
      'Unlimited properties and units',
      'Tenant, guest and client records',
      'Rent, invoices and payment tracking',
      'Due-date reminders and notifications',
      'Tenant portals, which never take a seat',
    ],
  },
  {
    name: 'Professional',
    price: '$79',
    cadence: 'per month',
    blurb: 'For agencies and managers running a full portfolio.',
    seats: seatsLabel('professional'),
    featured: true,
    includes: [
      'Everything in Starter',
      'Short stays, with check-in and check-out',
      'Maintenance board with estimated and final costs',
      'Revenue, occupancy and collection reporting',
      'Editable roles and permissions',
      'Google map with a pin on every property',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Talk to us',
    cadence: '',
    blurb: 'For groups running several portfolios, or keeping more than one landlord’s books.',
    seats: seatsLabel('enterprise'),
    featured: false,
    includes: [
      'Everything in Professional',
      'Multiple workspaces under one login',
      'Single sign-on with Google and Apple',
      'Priority support',
      'Assisted onboarding and data import',
    ],
  },
]

const FAQ = [
  {
    q: 'Do tenants and guests use up my seats?',
    a: 'No. A tenant portal is a login that reads one person’s own agreement, charges and documents; it is not a member of staff with fewer buttons. Only owners, managers, accountants and staff are counted against your plan, so you can give every tenant and guest access without it costing you a seat.',
  },
  {
    q: 'Can somebody at another agency see my properties?',
    a: 'No, and the protection does not depend on the application filtering correctly. Every record carries the workspace it belongs to, and the database itself declines to return a row from a workspace you are not an active member of. A fault in the application could therefore show you less than you are entitled to see, but never more.',
  },
  {
    q: 'What happens to a tenant who moves?',
    a: 'Check them out, and the unit is released from the day they actually left rather than the day the agreement said they would. It becomes available on the calendar immediately, and the client can then be placed elsewhere. Until that happens a client is held to one home at a time, which prevents anybody being billed rent for two.',
  },
  {
    q: 'Does it handle short stays as well as long leases?',
    a: 'Both, through the same set of records. The agreement form adapts to the kind of let you are creating and asks only for what it genuinely requires: a departure date and arrival times for a short stay, months paid up front and a notice period for an open-ended rental, and a fixed term for a lease.',
  },
  {
    q: 'Is my data really mine?',
    a: 'It is. Your workspace begins empty rather than pre-filled with samples, so there is never any question about whose figures are on the screen. If the platform cannot reach your database, it tells you so plainly and shows nothing at all rather than falling back on invented numbers.',
  },
  {
    q: 'What currency and calendar does it use?',
    a: 'Amounts are stored in a single base currency and presented in the one you choose. Dates follow the calendar of the place your workspace is set to, which defaults to Africa/Kampala, so that “today” on the screen and “today” in your ledger always mean the same day.',
  },
]

/* ------------------------------- page ------------------------------ */

export default function Landing() {
  const [shown, setShown] = useState(SHOWCASE[0]!.id)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* The mobile sheet must not leave the page scrolling behind it, and it
     closes on Escape like every other dialog in the product. */
  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [menuOpen])
  useEscape(menuOpen, () => setMenuOpen(false))

  const active = SHOWCASE.find((s) => s.id === shown) ?? SHOWCASE[0]!
  const signIn = () => goTo('#/signin')
  /* Every "start" call to action goes to the trial, not the password box.
     A landing page that sells a free trial and lands on a sign-in form is
     a door with the wrong sign on it. */
  const startFree = () => goTo('#/signup')

  /**
   * Left and right move between the screens, home and end jump to the
   * ends — what a tablist is supposed to do. Only the selected tab is in
   * the tab order, so Tab leaves the group rather than walking through
   * five buttons to reach the panel.
   */
  const onTabKey = (i: number) => (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    let next = -1
    if (step !== 0) next = (i + step + SHOWCASE.length) % SHOWCASE.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = SHOWCASE.length - 1
    if (next < 0) return
    e.preventDefault()
    setShown(SHOWCASE[next]!.id)
    tabRefs.current[next]?.focus()
  }

  const links = [
    ['Product', 'product'],
    ['Features', 'features'],
    ['Pricing', 'pricing'],
    ['FAQ', 'faq'],
  ] as const

  return (
    <div className="min-h-[100dvh] bg-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-surface-card focus:px-4 focus:py-2.5 focus:text-[13px] focus:font-medium focus:text-ink focus:shadow-lift"
      >
        Skip to content
      </a>

      {/* ------------------------- navigation ------------------------ */}
      {/* The bar stays dark once it lifts off the hero. The app's own
          `glass` is built on the card surface, which is ivory in light
          mode — and every colour in this nav is drawn for a dark ground,
          so it took the wordmark and "Sign In" down to ivory-on-ivory. */}
      <header
        className={cx(
          'fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,border-color,backdrop-filter] duration-300 ease-premium',
          scrolled
            ? 'border-b border-white/10 bg-navy-950/85 shadow-card backdrop-blur-md backdrop-saturate-150'
            : 'border-b border-transparent bg-transparent',
        )}
      >
        <nav className="mx-auto flex h-[68px] w-full max-w-6xl items-center gap-4 px-5 sm:px-8" aria-label="Main">
          <a href="#top" onClick={scrollTo('top')} className="shrink-0 rounded-xl" aria-label="Altier Properties, home">
            <Wordmark />
          </a>

          <ul className="ml-auto hidden items-center gap-1 lg:flex">
            {links.map(([label, id]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={scrollTo(id)}
                  className="rounded-lg px-3.5 py-2 text-[13.5px] font-medium text-[rgb(var(--c-text-onrail)/0.78)] transition-colors duration-200 hover:text-[rgb(var(--c-text-onrail))]"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center gap-2 lg:ml-3">
            <button
              onClick={signIn}
              className="hidden h-9 items-center rounded-xl border border-white/15 px-3.5 text-[13.5px] font-medium text-[rgb(var(--c-text-onrail))] transition-colors duration-200 hover:border-white/30 hover:bg-white/5 sm:inline-flex"
            >
              Sign In
            </button>
            <button
              onClick={startFree}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gold px-4 text-[13.5px] font-semibold text-navy-950 shadow-card transition-[background-color,transform] duration-200 hover:bg-gold-strong active:scale-[0.985]"
            >
              Start Free
            </button>
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[rgb(var(--c-text-onrail))] transition-colors hover:bg-white/10 lg:hidden"
            >
              <Menu size={19} />
            </button>
          </div>
        </nav>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: EASE }}
            className="absolute inset-x-3 top-3 overflow-hidden rounded-2xl bg-surface-card p-2 shadow-lift"
            role="dialog" aria-modal="true" aria-label="Menu"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="font-display text-[15px] font-semibold text-ink">Menu</span>
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="rounded-lg p-1.5 text-ink-secondary hover:bg-surface-inset">
                <X size={18} />
              </button>
            </div>
            <ul className="py-1">
              {links.map(([label, id]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    onClick={(e) => { scrollTo(id)(e); setMenuOpen(false) }}
                    className="block rounded-xl px-3 py-2.5 text-[14px] font-medium text-ink-secondary hover:bg-surface-inset hover:text-ink"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="grid gap-2 border-t border-line p-2 pt-3">
              <button onClick={signIn} className="h-10 rounded-xl border border-line text-[14px] font-medium text-ink hover:bg-surface-inset">Sign In</button>
              <button onClick={startFree} className="h-10 rounded-xl bg-navy-900 text-[14px] font-semibold text-[rgb(var(--c-text-onrail))] dark:bg-gold dark:text-navy-950">Start Free</button>
            </div>
          </motion.div>
        </div>
      )}

      <main id="main" tabIndex={-1}>
        {/* ---------------------------- hero --------------------------- */}
        <section id="top" tabIndex={-1} className="rail-gradient relative overflow-hidden bg-surface-rail pb-20 pt-[104px] sm:pb-28 sm:pt-[128px]">
          {/* A single warm bloom behind the headline — the same one the
              nav rail carries, so the two read as one surface. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-70"
            style={{ background: 'radial-gradient(60% 55% at 50% 0%, rgb(203 168 95 / 0.16), transparent 70%)' }}
            aria-hidden
          />
          <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="mx-auto max-w-3xl text-center"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-1.5 text-[12px] font-medium text-[rgb(var(--c-text-onrail-muted))]">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
                Built for landlords, agencies and short-stay hosts
              </span>

              <h1 className="mt-6 font-display text-[38px] font-semibold leading-[1.06] tracking-[-0.02em] text-[rgb(var(--c-text-onrail))] sm:text-[56px] lg:text-[68px]">
                Property management,{' '}
                <span className="relative whitespace-nowrap text-gold">
                  elevated.
                  <motion.span
                    className="absolute inset-x-0 -bottom-1.5 h-px gold-rule"
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.35 }}
                    aria-hidden
                  />
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-[rgb(var(--c-text-onrail-muted))] sm:text-[17px]">
                Altier Properties brings your rentals, real estate, serviced apartments and
                short stays together with the tenants, agreements, payments and availability
                behind them. One workspace for the whole portfolio, accurate as your team
                works in it.
              </p>

              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <button
                  onClick={startFree}
                  className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gold px-7 text-[15px] font-semibold text-navy-950 shadow-lift transition-[background-color,transform] duration-200 hover:bg-gold-strong active:scale-[0.985] sm:w-auto"
                >
                  Start Managing Properties
                  <ArrowRight size={16} className="transition-transform duration-300 ease-premium group-hover:translate-x-0.5" />
                </button>
                <a
                  href="#features"
                  onClick={scrollTo('features')}
                  className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/18 px-7 text-[15px] font-medium text-[rgb(var(--c-text-onrail))] transition-colors duration-200 hover:border-white/35 hover:bg-white/[0.06] sm:w-auto"
                >
                  Explore Features
                </a>
              </div>

              <p className="mt-5 text-[12.5px] text-[rgb(var(--c-text-onrail-muted))]">
                Your workspace opens empty. There is no sample data to clear out first.
              </p>
            </motion.div>

            {/* The product, immediately. */}
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
              className="relative mx-auto mt-14 max-w-5xl sm:mt-16"
            >
              <div className="absolute -inset-x-6 -bottom-6 -top-3 rounded-[2rem] bg-white/[0.04] blur-xl" aria-hidden />
              <Frame label="Altier Properties — Dashboard" className="relative">
                <DashboardPreview />
              </Frame>
            </motion.div>
          </div>
        </section>

        {/* -------------------------- outcomes ------------------------- */}
        <section id="product" tabIndex={-1} className="scroll-mt-24 border-b border-line bg-surface py-20 sm:py-28">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-gold-ink">Why it is worth it</p>
              <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[38px]">
                What changes when everything is in one place.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-secondary">
                Most portfolios are run from a spreadsheet, a phone and somebody’s memory. That
                holds together until it does not, and the cost is rarely small: a month’s
                rent nobody invoiced, or six weeks of an empty flat nobody noticed was
                empty.
              </p>
            </Reveal>

            <RevealGroup as="ul" className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {OUTCOMES.map((o) => (
                <motion.li key={o.value} variants={revealItem} className="card card-pad">
                  <p className="font-display text-[22px] font-semibold leading-none text-ink">{o.value}</p>
                  <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-gold-ink">{o.label}</p>
                  <p className="mt-3.5 text-[13.5px] leading-relaxed text-ink-secondary">{o.body}</p>
                </motion.li>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* -------------------------- features ------------------------- */}
        <section id="features" tabIndex={-1} className="scroll-mt-24 bg-surface py-20 sm:py-28">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <Reveal className="max-w-2xl">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-gold-ink">Everything in one place</p>
              <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[38px]">
                Everything the portfolio asks of you, in one place.
              </h2>
            </Reveal>

            <RevealGroup as="ul" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <motion.li
                  key={title}
                  variants={revealItem}
                  className="card card-pad group relative overflow-hidden transition-[border-color,box-shadow,transform] duration-300 ease-premium hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift"
                >
                  <span className="absolute inset-x-5 top-0 h-px gold-rule opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden />
                  <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft text-gold-ink">
                    <Icon size={18} aria-hidden />
                  </span>
                  <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-ink-secondary">{body}</p>
                </motion.li>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ------------------------ how it works ----------------------- */}
        <section className="border-y border-line bg-surface-inset/40 py-20 sm:py-28">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
              <Reveal>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-gold-ink">How it works</p>
                <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[38px]">
                  Set up in an afternoon.
                </h2>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-secondary">
                  There is no migration to survive and no consultant to book. Add your first
                  property, place a tenant in it, and everything else follows from those two
                  facts.
                </p>
                <button
                  onClick={startFree}
                  className="group mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-navy-900 px-6 text-[14px] font-semibold text-[rgb(var(--c-text-onrail))] shadow-card transition-[background-color,transform] duration-200 hover:bg-navy-800 active:scale-[0.985] dark:bg-gold dark:text-navy-950 dark:hover:bg-gold-strong"
                >
                  Create your workspace
                  <ArrowRight size={15} className="transition-transform duration-300 ease-premium group-hover:translate-x-0.5" />
                </button>
              </Reveal>

              <ol className="relative space-y-1">
                <span className="absolute bottom-6 left-[19px] top-6 w-px bg-line" aria-hidden />
                {STEPS.map((step, i) => (
                  <Reveal key={step.title} as="li" delay={i * 0.06} className="relative flex gap-5 pb-7 last:pb-0">
                    <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface-card font-display text-[15px] font-semibold text-gold-ink shadow-card">
                      {i + 1}
                    </span>
                    <div className="pt-1.5">
                      <h3 className="text-[15px] font-semibold text-ink">{step.title}</h3>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-secondary">{step.body}</p>
                    </div>
                  </Reveal>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ------------------------- showcase -------------------------- */}
        <section className="bg-surface py-20 sm:py-28">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-gold-ink">A look inside</p>
              <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[38px]">
                The screens you will use every day.
              </h2>
            </Reveal>

            <Reveal delay={0.05} className="mt-10">
              <div className="scroll-x -mx-5 px-5 sm:mx-0 sm:px-0">
                <div
                  role="tablist"
                  aria-label="Product screens"
                  className="mx-auto inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-inset p-1"
                >
                  {SHOWCASE.map((s, i) => {
                    const on = s.id === shown
                    return (
                      <button
                        key={s.id}
                        role="tab"
                        id={`showcase-tab-${s.id}`}
                        aria-selected={on}
                        aria-controls="showcase-panel"
                        tabIndex={on ? 0 : -1}
                        ref={(node) => { tabRefs.current[i] = node }}
                        onKeyDown={onTabKey(i)}
                        onClick={() => setShown(s.id)}
                        className={cx(
                          'relative whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200',
                          on ? 'text-ink' : 'text-ink-muted hover:text-ink-secondary',
                        )}
                      >
                        {on && (
                          <motion.span
                            layoutId="showcase-pill"
                            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                            className="absolute inset-0 rounded-lg bg-surface-card shadow-sm ring-1 ring-[rgb(var(--c-border))]"
                          />
                        )}
                        <span className="relative z-10">{s.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div
                id="showcase-panel"
                role="tabpanel"
                aria-labelledby={`showcase-tab-${active.id}`}
                tabIndex={0}
                className="mt-7"
              >
                <motion.div
                  key={active.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, ease: EASE }}
                >
                  <Frame label={active.file} className="mx-auto max-w-4xl">
                    {active.render()}
                  </Frame>
                  <p className="mx-auto mt-5 max-w-xl text-center text-[13.5px] leading-relaxed text-ink-secondary">
                    {active.note}
                  </p>
                </motion.div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* -------------------------- security ------------------------- */}
        <section className="relative overflow-hidden border-y border-line bg-surface-rail py-20 sm:py-28">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: 'radial-gradient(70% 60% at 20% 0%, rgb(203 168 95 / 0.12), transparent 65%)' }}
            aria-hidden
          />
          <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              <Reveal>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-gold">Your workspace</p>
                <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.015em] text-[rgb(var(--c-text-onrail))] sm:text-[38px]">
                  Your data is isolated by the database itself.
                </h2>
                <p className="mt-5 text-[15px] leading-relaxed text-[rgb(var(--c-text-onrail-muted))]">
                  Filtering records on their way out of the application is a promise the front
                  end makes and can break. Altier does not rely on it. Every property,
                  tenant, payment, booking and document carries the workspace it belongs to,
                  and Postgres itself declines to return a row from a workspace you are not
                  an active member of.
                </p>
                <p className="mt-4 text-[15px] leading-relaxed text-[rgb(var(--c-text-onrail-muted))]">
                  The practical effect is that a mistake in the application can only ever show
                  you less than you are entitled to see. It cannot show you somebody
                  else’s portfolio.
                </p>
              </Reveal>

              <RevealGroup as="ul" className="grid gap-3.5 sm:grid-cols-2">
                {[
                  { icon: Lock, title: 'A private workspace', body: 'Your portfolio belongs to your workspace alone. Nothing is pooled with other customers, and nothing is shared unless you share it.' },
                  { icon: ShieldCheck, title: 'Row-level security', body: 'Your membership record is the authority on what you may see. A request only makes a claim, and every claim is checked against it.' },
                  { icon: Users, title: 'Roles you control', body: 'Owner, manager, accountant and staff, with a permission grid you can edit yourself as your team changes shape.' },
                  { icon: Gauge, title: 'Only what they need', body: 'A manager sees the properties they have been assigned. A tenant sees their own agreement, charges and documents, and nothing further.' },
                ].map(({ icon: Icon, title, body }) => (
                  <motion.li
                    key={title}
                    variants={revealItem}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <span className="mb-3.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 text-gold">
                      <Icon size={17} aria-hidden />
                    </span>
                    <h3 className="text-[14px] font-semibold text-[rgb(var(--c-text-onrail))]">{title}</h3>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-[rgb(var(--c-text-onrail-muted))]">{body}</p>
                  </motion.li>
                ))}
              </RevealGroup>
            </div>
          </div>
        </section>

        {/* --------------------------- pricing ------------------------- */}
        <section id="pricing" tabIndex={-1} className="scroll-mt-24 bg-surface py-20 sm:py-28">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-gold-ink">Pricing</p>
              <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[38px]">
                Pay for the people, not the doors.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-secondary">
                Every plan includes unlimited properties and units. What differs between them is
                how many colleagues can work alongside you, and tenants and guests are never
                counted among them.
              </p>
            </Reveal>

            <RevealGroup as="ul" className="mt-14 grid items-start gap-5 lg:grid-cols-3">
              {PLANS.map((plan) => (
                <motion.li
                  key={plan.name}
                  variants={revealItem}
                  className={cx(
                    'relative flex h-full flex-col rounded-2xl border p-6 transition-[transform,box-shadow] duration-300 ease-premium sm:p-7',
                    plan.featured
                      ? 'border-gold/45 bg-surface-card shadow-lift lg:-mt-4 lg:pb-10'
                      : 'border-line bg-surface-card shadow-card hover:-translate-y-0.5 hover:shadow-lift',
                  )}
                >
                  {plan.featured && (
                    <span className="absolute -top-3 left-6 rounded-full bg-gold px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-navy-950">
                      Most chosen
                    </span>
                  )}
                  <h3 className="font-display text-[19px] font-semibold text-ink">{plan.name}</h3>
                  <p className="mt-1.5 text-[13px] text-ink-muted">{plan.blurb}</p>

                  <p className="mt-6 flex items-baseline gap-1.5">
                    <span className="tnum font-display text-[34px] font-semibold leading-none text-ink">{plan.price}</span>
                    {plan.cadence && <span className="text-[13px] text-ink-muted">{plan.cadence}</span>}
                  </p>
                  <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-gold-soft px-2.5 py-1 text-[11.5px] font-semibold text-gold-ink">
                    {plan.seats}
                  </p>

                  <ul className="mt-6 flex-1 space-y-2.5">
                    {plan.includes.map((line) => (
                      <li key={line} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-secondary">
                        <Check size={15} className="mt-0.5 shrink-0 text-gold-ink" aria-hidden />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={plan.name === 'Enterprise' ? signIn : startFree}
                    className={cx(
                      'mt-8 h-11 w-full rounded-xl text-[14px] font-semibold transition-[background-color,transform] duration-200 active:scale-[0.985]',
                      plan.featured
                        ? 'bg-gold text-navy-950 shadow-card hover:bg-gold-strong'
                        : 'border border-line bg-surface-card text-ink hover:border-line-strong hover:bg-surface-inset',
                    )}
                  >
                    {plan.name === 'Enterprise' ? 'Talk to us' : `Start on ${plan.name}`}
                  </button>
                </motion.li>
              ))}
            </RevealGroup>

            <Reveal delay={0.05}>
              <p className="mt-8 text-center text-[12.5px] leading-relaxed text-ink-muted">
                You can move up whenever your team outgrows its seats. Altier tells you as you
                approach the limit rather than at the moment an invitation is refused, and
                nothing is lost in the meantime.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ----------------------------- faq --------------------------- */}
        <section id="faq" tabIndex={-1} className="scroll-mt-24 border-t border-line bg-surface py-20 sm:py-28">
          <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
            <Reveal className="text-center">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-gold-ink">Questions</p>
              <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[38px]">
                Questions we are asked most often.
              </h2>
            </Reveal>

            <div className="mt-12 divide-y divide-[rgb(var(--c-border))] border-y border-line">
              {FAQ.map((item, i) => (
                <Reveal key={item.q} delay={Math.min(i * 0.04, 0.16)}>
                  <details className="group py-1">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-[14.5px] font-medium text-ink transition-colors hover:text-gold-ink [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <ChevronDown
                        size={17}
                        className="shrink-0 text-ink-muted transition-transform duration-300 ease-premium group-open:-rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <p className="animate-fade-rise pb-5 pr-9 text-[13.5px] leading-relaxed text-ink-secondary">
                      {item.a}
                    </p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------- final cta ------------------------ */}
        <section className="relative overflow-hidden bg-surface-rail py-24 sm:py-32">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(55% 70% at 50% 110%, rgb(203 168 95 / 0.20), transparent 70%)' }}
            aria-hidden
          />
          <Reveal className="relative mx-auto w-full max-w-3xl px-5 text-center sm:px-8">
            <h2 className="font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-[rgb(var(--c-text-onrail))] sm:text-[46px]">
              Bring every property into focus.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[rgb(var(--c-text-onrail-muted))] sm:text-[16.5px]">
              One workspace for every property, every tenant and every shilling: private to
              you, accurate as you work, and ready the same afternoon you begin.
            </p>
            <button
              onClick={startFree}
              className="group mt-10 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gold px-8 text-[15px] font-semibold text-navy-950 shadow-lift transition-[background-color,transform] duration-200 hover:bg-gold-strong active:scale-[0.985]"
            >
              Get Started with Altier Properties
              <ArrowRight size={16} className="transition-transform duration-300 ease-premium group-hover:translate-x-0.5" />
            </button>
            <p className="mt-5 text-[12.5px] text-[rgb(var(--c-text-onrail-muted))]">
              No card required to begin. Your workspace starts empty and remains private to you.
            </p>
          </Reveal>
        </section>

        {/* ---------------------------- footer ------------------------- */}
        <footer className="border-t border-white/10 bg-surface-rail pb-10 pt-16">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
              <div>
                <Wordmark />
                <p className="mt-5 max-w-xs text-[13px] leading-relaxed text-[rgb(var(--c-text-onrail-muted))]">
                  A platform for managing real estate, rentals, serviced apartments, short stays
                  and commercial space, with the tenants, payments and paperwork that come
                  with them. Built in Kampala.
                </p>
              </div>

              {[
                { heading: 'Product', links: [['Features', '#features'], ['Pricing', '#pricing'], ['FAQ', '#faq'], ['Start free', '#/signup'], ['Sign in', '#/signin']] },
                { heading: 'Support', links: [['Help centre', '#faq'], ['Getting started', '#product'], ['Status', '#top'], ['Contact', 'mailto:hello@altierproperties.com']] },
                { heading: 'Company', links: [['Privacy policy', '#privacy'], ['Terms of service', '#terms'], ['Security', '#top'], ['Careers', '#top']] },
              ].map((group) => (
                <div key={group.heading}>
                  <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--c-text-onrail))]">{group.heading}</h2>
                  <ul className="mt-4 space-y-2.5">
                    {group.links.map(([label, href]) => (
                      <li key={label}>
                        <a
                          href={href!}
                          onClick={href!.startsWith('#') && !href!.startsWith('#/') ? scrollTo(href!.slice(1)) : undefined}
                          className="link-underline text-[13px] text-[rgb(var(--c-text-onrail-muted))] transition-colors duration-200 hover:text-[rgb(var(--c-text-onrail))]"
                        >
                          {label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-col items-center justify-between gap-5 border-t border-white/10 pt-7 sm:flex-row">
              <p className="text-[12px] text-[rgb(var(--c-text-onrail-muted))]">
                © {new Date().getFullYear()} Altier Properties. All rights reserved.
              </p>
              <ul className="flex items-center gap-2">
                {[
                  ['X', 'M13.7 10.6 20.4 3h-1.6l-5.8 6.6L8.3 3H3l7 10.1L3 21h1.6l6.1-7 4.9 7H21l-7.3-10.4Zm-2.2 2.4-.7-1L5.2 4.2h2.4l4.5 6.5.7 1 5.9 8.4h-2.4L11.5 13Z'],
                  ['LinkedIn', 'M6.94 5A1.94 1.94 0 1 1 3.06 5a1.94 1.94 0 0 1 3.88 0ZM3.3 8.4h3.4V21H3.3V8.4Zm5.6 0h3.24v1.72h.05c.45-.86 1.56-1.77 3.2-1.77 3.42 0 4.05 2.25 4.05 5.18V21h-3.4v-6.1c0-1.46-.03-3.33-2.03-3.33-2.03 0-2.34 1.59-2.34 3.23V21H8.9V8.4Z'],
                  ['Instagram', 'M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2Zm0 5.8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 6.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Zm5.1-6.75a.94.94 0 1 1-1.87 0 .94.94 0 0 1 1.87 0Z'],
                ].map(([label, path]) => (
                  <li key={label}>
                    <a
                      href="#top"
                      onClick={scrollTo('top')}
                      aria-label={`Altier Properties on ${label}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-[rgb(var(--c-text-onrail-muted))] transition-colors duration-200 hover:border-white/25 hover:text-[rgb(var(--c-text-onrail))]"
                    >
                      <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" aria-hidden>
                        <path d={path} fill="currentColor" />
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
