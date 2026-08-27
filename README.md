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

That runs against the bundled demo portfolio, entirely in the browser. To run it against a real
database instead, seed one and start the API alongside the dev server:

```bash
npm run db:seed    # loads the demo portfolio into Postgres (or PGlite)
npm run api        # http://localhost:5174
npm run dev        # in a second terminal
```

The dev server proxies `/api` to the API process, so nothing needs configuring. Settings → Profile
says which of the two is in play — **Live database** or **Sample data** — and every change is
written through. If the API is not running the app falls back to the bundled portfolio rather than
failing, which is exactly how the published single-file build works.

### How it fits together

The client holds the whole portfolio in one store and every selector reads plain arrays, so the
database changed nothing about how the pages are written. `src/lib/api.ts` loads the portfolio once
at boot; the store applies each change locally for an instant response, writes it through, and then
adopts the server's copy — so the two cannot drift, and a rejected write re-reads rather than
guessing. Every mutation endpoint answers with the refreshed portfolio for that reason.

| Endpoint | Purpose |
|---|---|
| `GET /api/portfolio` | the bootstrap payload: properties, clients, bookings, invoices, maintenance, team, reminder settings |
| `POST /api/invoices/:id/payment` | record a payment in full |
| `POST /api/invoices/:id/reminder` | log a payment reminder against the client |
| `PATCH /api/properties/:id/status` | move a property between the five states |
| `PATCH /api/maintenance/:id/status` | advance a maintenance request |
| `POST /api/maintenance` | raise a new request |
| `POST /api/clients/:id/notes` | append to a client's communication history |
| `POST /api/properties` | add a property |
| `PUT /api/properties/:id` | edit one |
| `POST /api/clients` | add a client |
| `POST /api/bookings` | open an agreement, with its opening charges |
| `PUT /api/settings/reminders` | change reminder timing |

Plus the ones outside the gate: `GET /api/auth/me`, `POST /api/auth/login`,
`POST /api/auth/logout`, and `GET /api/auth/claimable` + `POST /api/auth/setup`
while the first-run window is open.

## Signing in

Altier has accounts. A deployment with a database behind it refuses every
request without a session, and refuses again if the account's role does not
hold the permission — the same matrix the interface draws from, applied where
it protects something rather than only where it is visible.

**First run.** A freshly created database has the team but no passwords, so
nobody can sign in. The sign-in page notices and offers to claim one of those
accounts by giving it a password. That window shuts permanently the moment any
account has one. **Do it immediately after deploying**, before the address is
shared — until you do, whoever reaches the page first can claim an account. Set
`SETUP_TOKEN` in the environment if you would rather the claim require a secret
as well.

Afterwards, an owner adds people from Settings → Team and sets their initial
password there. Tell them out of band, and ask them to change it from Settings →
Profile; changing a password signs out every other device.

| | |
|---|---|
| Passwords | scrypt (`node:crypto`), OWASP N=2^15 r=8 p=3, per-password salt |
| Sessions | opaque 32-byte token in an httpOnly, SameSite=Lax cookie; 14 days |
| Storage | only the SHA-256 of the token is stored, so the table is not a key ring |
| Revocation | removing a team member cascades to their sessions immediately |
| Throttling | 8 failed attempts locks an account for 15 minutes, recorded on the row so it survives across serverless instances |
| Enumeration | an unknown email and a wrong password give the same message, and take the same time |

Roles are enforced on the server, not merely in the interface. A staff account
receives no charges at all from `GET /api/portfolio` — they are withheld rather
than hidden — and a request it may not make is answered 403. The smoke test
asserts both, and was verified to fail when the gate is removed.

Without a database there is nobody to be signed in as, so the bundled demo
skips all of this and keeps the role switcher as a way to see what each role
reaches.

## Deploying

The published build works with no server at all — it falls back to the bundled
portfolio and keeps every change in the browser tab. That is fine for a demo and
useless for running a business, so a real deployment needs a database behind it.

Three steps, once:

**1. Create a Postgres.** Neon, Supabase and Vercel Postgres all work. Copy the
**pooled** connection string — a serverless function opens a connection per
instance, and the unpooled endpoint runs out of them.

**2. Create the schema.** Two ways, whichever suits.

*Nothing installed:* open the database's SQL editor, paste
[`docs/setup.sql`](docs/setup.sql) and run it. That creates the schema and the
two things the app cannot start without — the reminder settings and the team a
property is assigned to. It refuses to run twice, and it records the migrations
as applied so a later `db:migrate` is a no-op.

*Upgrading a database that already exists* — one that was set up before a
later change added tables or columns: paste
[`docs/upgrade.sql`](docs/upgrade.sql) instead. It applies only the
migrations that database has not seen, skips itself on a second run, and
leaves the records alone. Your properties, clients and charges survive it.

*With the repo cloned:*

```bash
DATABASE_URL='postgres://…' npm run db:init   # same result as setup.sql
DATABASE_URL='postgres://…' npm run db:seed   # or the Kampala demo portfolio
```

`db:seed` replaces everything with the demo portfolio; it truncates, so never
point it at a database holding real records. `docs/setup.sql` and `docs/upgrade.sql` are generated by `npm run db:sql`;
CI fails if either drifts, and separately proves the upgrade path by taking a
database at the first migration through it twice.

**3. Set `DATABASE_URL` in the hosting project's environment variables** and
redeploy. On Vercel that is Settings → Environment Variables; `vercel.json` and
`api/[...path].ts` are already in the repository, so the API deploys with the
site.

Check it landed by opening `/api/health` on the deployed URL:

```json
{ "ok": true, "driver": "postgres", "schema": "ready", "properties": 24 }
```

`"schema": "missing"` means step 2 has not been run against that database.
A 500 naming `DATABASE_URL` means step 3 has not. And if Settings → Profile
still says **Sample data**, the app never reached the API at all — the browser's
network tab on `/api/portfolio` will say why.

### Why the API is one function

`api/[...path].ts` mounts the same Express app the local process runs. The
catch-all filename is deliberate: Vercel routes every `/api/*` path to it
natively, so no rewrite sits between the request and the app. The app also
re-adds the `/api` prefix if the platform strips it, so it behaves the same
either way — both paths are covered by the smoke test.

PGlite is refused in production on purpose. A serverless filesystem is thrown
away between invocations, so falling back to it would serve an empty portfolio
and look exactly like data loss.

CI runs typecheck, the accounting invariants, the database round trip against both drivers, the API
smoke test and the production build on every pull request and on every push to `main`
(`.github/workflows/ci.yml`).

## Database

The app runs off the bundled generated portfolio unless an API is reachable. `server/db/` is the
persistence layer beneath it: a Postgres schema, migrations, and a seeder that loads the demo
portfolio using the very generator the UI runs on — so the seeded database holds exactly the data
the interface shows, anchored to today.

```bash
npm run db:generate   # regenerate migrations after changing the schema
npm run db:migrate    # apply pending migrations
npm run db:init       # empty portfolio: settings and team only
npm run db:seed       # truncate and load the demo portfolio
npm run db:check      # migrate, seed, then verify the round trip
npm run smoke:api     # boot the API and exercise reads, writes and error paths
```

Set `DATABASE_URL` to point at Postgres (see `.env.example`). Without one, everything falls back to
**PGlite** — Postgres compiled to WebAssembly — so the schema and seeder can be exercised with no
server running. PGlite persists at `.pglite`, so a seed survives between commands. Same SQL either
way; CI runs the round trip against both.

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
