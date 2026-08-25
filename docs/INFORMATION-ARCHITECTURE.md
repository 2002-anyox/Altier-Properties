# Altier Properties — information architecture & user flows

## 1. Design principles

1. **One portfolio, one list.** The letting model (long term / short stay) is an attribute of a
   property, never a separate mode. A mixed portfolio is a single list, a single calendar and a
   single ledger. This is the product's reason to exist.
2. **Navigate by object, not by department.** A manager thinks "the calendar" and "that property",
   never "the leasing module".
3. **Every table is a report.** Search, filter, sort and a table view sit on every surface, including
   every chart. Nothing forces an export.
4. **Show money before it moves.** Fees, who pays them and the funding date appear inline on payment
   surfaces.
5. **Motion is a garnish, never a gate.** Every animation is short, purposeful, and disabled entirely
   under `prefers-reduced-motion`.

## 2. Navigation

A persistent left rail, grouped into four sections, filtered by the signed-in role.

```
OVERVIEW      Dashboard              at-a-glance state of the portfolio
              Availability           calendar, timeline and free-unit list

PORTFOLIO     Properties             every unit and listing
              Bookings & leases      long tenancies and short stays, one pipeline
              Clients                tenants, guests, corporate accounts

OPERATIONS    Payments        [n]    invoices, due dates, overdue balances
              Maintenance     [n]    jobs, vendors, cost and timeline
              Notifications   [n]    reminders and alerts

INSIGHT       Reports                occupancy, revenue, collection, performance
              Settings               profile, team, roles, reminder timing, theme
```

The top bar carries the three things needed from anywhere: **global search** (⌘K / `/`),
**notifications**, and the **role switcher**. Rail badges show live counts of overdue payments,
urgent maintenance and unread notifications.

## 3. Object model

```
Property ──┬── Booking (lease | short stay) ──── Client
           ├── Invoice ─────────────────────────  Client
           ├── MaintenanceRequest ──────────────  Vendor / staff
           ├── Document
           └── OccupancySpell (history)

TeamMember ── manages ──> Property
Notification ── points at ──> Property | Client | Invoice | Booking | MaintenanceRequest
```

A **Booking** is deliberately polymorphic: `mode: 'long_term' | 'rental' | 'short_stay'`. A
twelve-month lease, an open-ended rental and a three-night stay are the same object at different
densities — that is what lets one calendar, one ledger and one pipeline serve all three.

| Mode | End date | Money up front | Ends when |
|---|---|---|---|
| `long_term` | fixed | one month deposit | the term runs out, or it is renewed |
| `rental` | **none** | deposit **plus 3–12 months rent in advance** | the tenant gives notice (30–60 days) |
| `short_stay` | fixed | full stay charged before arrival | check-out |

The open-ended rental is the common arrangement in much of East Africa and is absent from every
product surveyed. It has no expiry to count down to, so the thing that matters is the date rent is
**paid through**: the advance sets it at move-in, each monthly payment pushes it forward, and the
platform warns as it approaches and again once it lapses into arrears. On the timeline these
agreements are drawn without a right-hand edge, because they have no scheduled end.

**Presentation** is separate from data. Amounts are stored in Ugandan shillings and converted at
display time; region controls date and number formatting; language controls the interface chrome.
None of the three rewrites a stored figure.

The demo portfolio is 24 properties across Kampala, Wakiso and Entebbe: prime lettings in Kololo and
Nakasero, open-ended rentals in Ntinda, Najjera, Kansanga and Kira, short stays in Bugolobi, Muyenga
and on the Entebbe lakeshore, and commercial space in Nakasero, on Kampala Road and at Namanve.

**Property status** is a five-state system used consistently across every surface, always paired with
a label so colour never carries the meaning alone:

`Available` · `Occupied` · `Reserved` · `Under maintenance` · `Inactive`

## 4. Page-level architecture

### Dashboard
Hero revenue figure (one per view) → KPI tiles (properties, occupied, vacant, active clients,
overdue, upcoming, open maintenance) → revenue collected vs billed → portfolio status donut →
three attention panels: needs chasing, arrivals & departures, maintenance pipeline by stage and
becoming-available → a fortnight of upcoming obligations.

Figures the role cannot see are removed, not greyed out: staff see no money.

### Properties
Grid / list / map views over one filter set (status chips, type, letting model, district, manager,
sort, free-text). The map is a schematic district plan — pins coloured by status, with a detail card.

**Property detail** uses a tabbed subnav with lifecycle actions on the tab that owns them:
`Overview · Occupancy · Financials · Maintenance · Documents · Activity`, under a hero showing photo,
status, price, key facts, assigned manager and current position.

### Availability
Three views of the same data:
- **Timeline** — properties as rows, days as columns, leases as continuous bars and stays as blocks.
  Fortnight paging, today marked, weekends shaded.
- **Month** — a calendar with arrival/departure counts per day and a day-detail panel.
- **List** — grouped by status, with a *becoming available* section for the next 60 days.

### Bookings & leases
One pipeline with status, model and source filters, opening into a detail drawer that shows the
client, the property, the term, the deposit, the linked charges and the turnover prompt.

### Clients
Cards with contact, associated properties, lifetime value and rating.
**Client detail** tabs: `Overview · Agreements · Payments · Documents · Communications`, with
payment reliability, an ID document vault and a single communications thread spanning email, calls,
SMS, portal messages and internal notes.

### Payments
Four state tiles (collected, pending, overdue, upcoming) → an overdue-ageing chart → a filterable
ledger with inline *record payment* and *send reminder* actions → an invoice drawer with the fee and
funding disclosure. Deep-linkable: `#/payments?invoice=<id>`.

### Maintenance
A five-column board (`Reported · Scheduled · In progress · Awaiting parts · Completed`) or a list,
with a job drawer carrying priority, vendor, assignee, estimate, actual cost and a full timeline.
New jobs can be raised from a modal.

### Notifications
Grouped by day, filterable by read state, priority and kind, each with a direct action back to the
underlying record. Reminder thresholds are configurable and rebuild the feed immediately.

### Reports
Occupancy, vacancy, collection rate and overdue exposure → revenue performance → portfolio
composition → revenue by district → letting-model comparison → per-property performance table →
client activity and overdue ageing.

## 5. Key user flows

**Chase an overdue payment**
`Dashboard → "Needs chasing" → invoice drawer → Send reminder` (logs to the client's communication
history) `→ Record payment` (settles the invoice, clears its notification).

**Turn a vacancy around**
`Dashboard → "Becoming available" → property → set status Available → Availability timeline` to see
the gap in context.

**Handle a maintenance report**
`Notifications → maintenance alert → Open job → assign vendor → move through the board → Mark
complete` (writes the completion into the timeline and the property's activity feed).

**Prepare an arrival**
`Dashboard → "Arrivals & departures" → Bookings → agreement drawer → turnover prompt → Maintenance`.

**Review a client before renewal**
`Clients → client → Payments tab` (reliability score) `→ Agreements tab` (term end) `→ Communications`.

**Answer "what is free next month?"**
`Availability → Month or List → Becoming available`, or ⌘K → "Show vacant properties".

## 6. Role-based access

| Capability | Owner | Manager | Staff | Accountant |
|---|:--:|:--:|:--:|:--:|
| Dashboard | ● | ● | ● | ● |
| Properties — view / edit | ● / ● | ● / ● | ● / — | ● / — |
| Availability calendar | ● | ● | ● | ● |
| Bookings — view / edit | ● / ● | ● / ● | ● / — | ● / — |
| Clients — view / edit | ● / ● | ● / ● | ● / — | ● / — |
| Payments — view / record | ● / ● | ● / — | — | ● / ● |
| Maintenance — view / edit | ● / ● | ● / ● | ● / ● | — |
| Financial figures | ● | ● | — | ● |
| Reports | ● | ● | — | ● |
| Manage team | ● | — | — | — |

Access is enforced in three places: the rail hides sections, routes render an explanatory
"not available for this role" state rather than a dead end, and individual actions and figures
disappear from records.

## 7. Accessibility commitments

- Motion respects `prefers-reduced-motion`; nothing is gated behind an animation.
- Every chart ships a legend, direct labels and a **table view**; the categorical palette is
  validated for colour-vision deficiency against each theme's own surface.
- Status is always colour **plus** label.
- Keyboard: ⌘K or `/` opens the command palette, `Esc` closes any overlay, a skip link precedes the
  rail, and focus is a single 2px gold ring visible on both themes.
- Layouts are responsive from 360px up; wide tables scroll inside their own container so the page
  body never scrolls horizontally.
