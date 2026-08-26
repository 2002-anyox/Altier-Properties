<div align="center">

# Altier Properties

**A premium property management platform for real estate, rentals, serviced apartments,
short stays and commercial space — one portfolio, one calendar, one ledger.**

[![CI](https://github.com/2002-anyox/Altier-Properties/actions/workflows/ci.yml/badge.svg)](https://github.com/2002-anyox/Altier-Properties/actions/workflows/ci.yml)

</div>

---

Altier Properties is a web application for property owners, managers, operations staff and
accountants. It handles long tenancies and Airbnb-style short stays in the same system, on the
principle that a twelve-month lease and a three-night stay are the same object seen at different
densities — so a mixed portfolio never fragments into two tools.

## What is in here

| Path | What it holds |
|---|---|
| `docs/RESEARCH.md` | Competitive research across Buildium, AppFolio, Guesty, Hostaway, Rentec Direct, DoorLoop, Lodgify, Yardi Breeze, Innago, Hospitable, Propertyware and others — table stakes, differentiators, common complaints, and what Altier adopts or improves on |
| `docs/INFORMATION-ARCHITECTURE.md` | Navigation, object model, page architecture, user flows, the role matrix and accessibility commitments |
| `src/lib/` | Domain types, the seeded sample portfolio, derived metrics, the app store and role definitions |
| `src/components/` | UI primitives, the hand-built SVG chart toolkit, layout and navigation |
| `src/pages/` | The twelve application screens |

## Features

**Dashboard** — hero revenue figure, KPI tiles for total properties, occupied and vacant units,
active clients, overdue and upcoming payments and open maintenance; revenue collected against
billed; portfolio status; and three attention panels (needs chasing, arrivals and departures,
maintenance pipeline by stage and what is becoming available).

**Properties** — grid, list and schematic map views over one filter set; property profiles with
imagery, address, amenities, price, status, assigned manager, occupancy history, maintenance notes,
documents, financials and an activity feed.

**Status system** — Available, Occupied, Reserved, Under maintenance, Inactive, applied consistently
and always paired with a label.

**Availability** — a portfolio timeline (properties as rows, days as columns), a month calendar with
arrivals and departures, and a list view including everything freeing up in the next 60 days.

**Clients** — tenants, guests and corporate accounts with contacts, ID documents, associated
properties, agreements, payment history, reliability scoring, notes and a single communications
thread across email, calls, SMS, portal messages and internal notes.

**Bookings and tenancies** — three agreement types in one pipeline:

- *Fixed-term lease* — a start, an end and a renewal decision.
- *Open-ended rental* — runs until the tenant gives notice, and pays a cycle at a time: three, six or
  twelve months up front, repeating for as long as the tenancy lasts, so it cannot collapse after one
  or two months and strand the owner. The record carries the cycle length, the notice required and the
  date rent is paid through; alerts fire as that date approaches and again once it lapses.
- *Short stay* — nightly, Airbnb-style.

**Region, currency and language** — figures are held in shillings and presented in whatever currency
you choose, so switching never rewrites a stored amount. Ten currencies, region-aware date and number
formatting, and an interface language setting.

**Payments and invoices** — rent, advances, deposits, bookings and ancillary charges; paid, pending,
part paid, overdue and upcoming; overdue ageing; inline *record payment* and *send reminder*; an
invoice drawer that discloses fees and funding dates.

**Maintenance** — a five-stage board or list, with priority, vendor, assignee, estimated and actual
cost, and a full job timeline.

**Notifications** — approaching due dates, overdue balances, lease expiries, check-ins and
check-outs, vacancy exposure, maintenance deadlines and document renewals, with filters, priority
levels, read state and configurable reminder timing.

**Reports** — occupancy and vacancy rates, revenue performance, collection rate, overdue exposure and
ageing, revenue by district, letting-model comparison, per-property performance and client activity.

**Revenue that tells the truth** — every charge records the period it pays for, and revenue is
recognised across that period day by day. A quarterly advance is earned over its three months, a stay
crossing a month boundary is earned partly in each, and deposits are never earned at all. The
dashboard leads with revenue *earned* on that accrual basis and shows cash collected, the part of it
buying time ahead, and deposits separately — so a six-month advance cannot masquerade as growth, and
a quiet collection month cannot masquerade as decline.

**Role-based access** for Owner, Property Manager, Staff and Accountant, enforced in the navigation,
at the route and on individual actions and figures. Switch role from the avatar menu to see it.

## Design

- **Palette** — deep charcoal-navy, warm ivory, muted gold, in a fully theme-aware token system.
  Both light and dark are first-class; the dark theme is a designed set of values, not an inversion.
- **Typography** — Fraunces for display headings, Inter for the interface and all data. Large figures
  stay in the sans by design.
- **Motion** — one easing curve throughout, page transitions that rise a few pixels, staggered list
  entrances, a shared-layout underline on tabs, and count-ups on figures. Everything short, and
  everything disabled under `prefers-reduced-motion`.
- **Charts** — hand-built SVG: an area trend with a crosshair tooltip, a donut, grouped columns,
  horizontal bars and sparklines. The categorical palette was validated for colour-vision deficiency
  against each theme's own surface, and every chart carries a legend and a table view.

## Running it

```bash
npm install
npm run dev        # development server
npm run build      # production build to dist/
npm run preview    # serve the production build
npm run typecheck  # TypeScript, no emit
npm run check:accounting  # revenue-recognition invariants
```

CI runs typecheck, the accounting invariants, the database round trip and the production build on
every pull request and on every push to `main` (`.github/workflows/ci.yml`).

## Database

The app currently runs entirely in the browser off a generated portfolio. `server/db/` adds the
persistence layer beneath it: a Postgres schema, migrations, and a seeder that loads the demo
portfolio using the very generator the UI runs on — so the seeded database holds exactly the data
the interface shows, anchored to today.

```bash
npm run db:generate   # regenerate migrations after changing the schema
npm run db:migrate    # apply pending migrations
npm run db:seed       # truncate and load the demo portfolio
npm run db:check      # migrate, seed, then verify the round trip
```

Set `DATABASE_URL` to point at Postgres (see `.env.example`). Without one, everything falls back to
**PGlite** — Postgres compiled to WebAssembly — so the schema and seeder can be exercised with no
server running. Same SQL either way; CI runs the round trip against both.

`db:check` is the one to trust. It migrates, seeds, reads the portfolio back out, and asserts:

- no rows lost, and billed and collected totals unchanged to the shilling
- revenue recognition identical month by month against the in-memory figures
- nulls preserved, so an open-ended rental doesn't quietly become a fixed-term lease
- deferred revenue and deposits still separable
- no orphaned relations
- the schema's `CHECK` constraints genuinely reject invalid rows — with a control row that must be
  accepted, so a probe failing for the wrong reason can't produce a false pass

### Schema notes

The domain's string unions are Postgres enums, and the arrays embedded in the in-memory model become
child tables (`property_amenities`, `communications`, `maintenance_events`, and so on). Money is held
in the base currency as whole units; presentation currency is a client concern and is deliberately
not stored per row.

Notifications have no table on purpose — they are derived from invoices, bookings and properties, so
persisting them would only let them go stale.

Invariants the database enforces rather than trusting the application to maintain:

| Constraint | Why |
|---|---|
| `invoices_earns_valid` | recognition divides by the earning period; a zero-length one is a crash |
| `invoices_paid_consistent` | money without a date, or a date without money, is a broken ledger |
| `invoices_paid_within_amount` | an invoice cannot be overpaid |
| `bookings_open_ended_is_rental` | only a rental may omit an end date |
| `maintenance_completed_consistent` | a job is completed exactly when it has a completion date |

Requires Node 18 or newer. There is no backend: the sample portfolio — 24 properties across Kampala,
Wakiso and Entebbe, priced in Ugandan shillings — is generated deterministically at load and anchored
to today's date, so due dates, arrivals and overdue balances are always live.
Role and reminder preferences persist in `localStorage`; **Settings → Profile → Reset demo data**
restores everything.

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · Framer Motion · React Router · Lucide icons.
No chart library, no component library, no network calls.
