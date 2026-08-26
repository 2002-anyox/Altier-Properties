# Property management software — competitive research

Research brief for Altier Properties. Products studied: **Buildium, AppFolio, Guesty,
Hostaway, Rentec Direct, DoorLoop, TenantCloud, Lodgify, Yardi Breeze, Innago,
Hospitable, Propertyware, Avail**.

> Method note: vendor domains and the major review aggregators (G2, Capterra) were blocked
> by this environment's egress proxy for direct fetching. Findings were assembled from
> search-result synthesis over vendor pages, help centres and third-party pricing/review
> aggregators. Pricing is directionally correct, not contractual.

---

## 1. Product profiles

| Product | Segment | Strongest at | Weakest at | Pricing shape |
|---|---|---|---|---|
| **Buildium** | Long-term residential + HOA, ~10–100 units | Accounting depth: full GL, trust accounting, 1099 e-filing; e-payments auto-applied to the ledger | Owner statements can't vary per owner; integrations pulled without notice | Flat tiers ~$62 / $192 / $400 per month, plus per-transaction EFT fees ($0.60–$2.35) that add an estimated 30–50% |
| **AppFolio** | Mid-market to enterprise, 50-unit minimum | Breadth; Realm-X agentic AI (leasing, maintenance, resident messenger) and a workflow builder; commercial rent escalations | Support response times; refunds/reconciliation confusing; minimums punish small portfolios | Per-unit with hard floors: Core ~$1.40–1.49/unit ($280–298 min), Plus ~$3.00–3.20 ($960 min), Max ~$5 ($7,500 min) |
| **Guesty** | Short-term rental managers | Multi-Calendar and unified inbox are the category reference; Guesty Shield (damage cover to $50K, ID + facial + criminal screening) | Heavy, slow UI; messages need manual refresh; analytics gated behind a per-property fee | Lite published (~$16–29/listing); Pro and Enterprise quote-only; 1% fee on qualifying reservations |
| **Hostaway** | Professional STR, 5–200+ listings | Direct-API channel sync; unified inbox across OTA + email + SMS + WhatsApp; best review scores in the category (~4.8) | Dated UI with a real learning curve; à-la-carte fees for pricing, booking engine, SMS | Quote-only, ~$25–50/listing at low volume, compressing to $15–25/door; $300–1,000+ setup |
| **Rentec Direct** | Landlords and small PM firms | The most transparent pricing in the market; easy for non-accountants; Zillow syndication | **No manager mobile app at all**; tenant app bugs; not customisable | Pro $2.00/unit, PM $2.50/unit, $50/month minimum, no contract |
| **DoorLoop** | Modern LTR challenger, 20+ units | UI clarity — "minimal clicks", slide-out filter panel, centralised tenant/lease/payment record; onboarding support | ~3 business-day funding delays; steep auto-renewal price jumps | ~$69 / $149 / $209 per month yearly; ACH fee is the tier lever ($2.49 → $0.99 → free) |
| **TenantCloud** | DIY landlord → small PM | Feature depth per pound; clear upgrade path | Navigation repeatedly criticised; limited payment options | ~$15 / ~$50 / custom |
| **Lodgify** | Direct-booking-first STR | Best website + booking engine output in the category | **1.9% booking fee** hidden below the top tier; confusing rate setup | ~$16 / ~$42 / ~$103 per month, the fee removed only at Ultimate |
| **Yardi Breeze Premier** | SMB residential + commercial + associations | The only SMB product with genuine commercial coverage; strong live support | Weak integrations; no automated lease-renewal reminders; unintuitive navigation | $2/unit with a **$400/month minimum** — effectively $8/unit at 50 units |
| **Innago** | Small landlords | Free subscription; highest satisfaction scores (4.9 on G2 and Capterra) | Payment reversals debited without notice; shallow reporting | $0 subscription, monetised on ACH/card and screening fees |
| **Hospitable** | Individual Airbnb hosts | AI messaging (~15-second replies, 70–80% time saved); **dynamic pricing bundled free** | Weak calendar view; Booking.com/Vrbo sync less polished than Airbnb | From ~$29/month |
| **Propertyware** | Single-family at scale | Customisation ceiling and open two-way API | Dated UI, long setup, billing errors, frequent bugs — the weakest satisfaction in the set (~74%) | $1–2/unit with a $250/month minimum plus steep implementation |
| **Avail** | DIY landlords | Free; state-specific leases; fast support | Slow payment processing; no dedicated app | Free tier + paid add-ons |

---

## 2. Table stakes

Missing any one of these disqualifies a product from serious consideration.

1. Portfolio → property → unit/listing hierarchy with photos, amenities, per-unit financials
2. Tenant/guest record with contacts, documents, ledger and communication history
3. Online payments — ACH and card, autopay, auto-application to the ledger, receipts
4. Maintenance request → work order → vendor assignment → completion, photo intake
5. Document storage plus e-signature on agreements
6. Tenant/guest portal **and** owner portal, each self-service
7. Listing distribution: syndication for long lets, OTA channel sync for short stays
8. Applications and screening (credit, background, eviction, income); ID verification for guests
9. Accounting — income/expense at minimum, full double-entry GL for PM firms
10. A canned report library: rent roll, delinquency, income statement, occupancy
11. Automated communications — announcements, rent reminders, templated email/SMS
12. Calendar / availability view
13. Mobile access (native app now expected, not merely responsive web)
14. Role-based access for staff, owners, vendors, tenants

---

## 3. Differentiators that actually win deals

| Differentiator | Who has it | Why it matters |
|---|---|---|
| Agentic AI that *acts* rather than chats | AppFolio Realm-X Performers and Flows | The 2026 arms race; end-to-end leasing and maintenance without a human in the loop |
| True trust accounting, owner distributions with reserves, 1099 e-filing | Buildium, Rentec PM, Yardi, Propertyware | Legally non-optional for US PM firms; STR tools mostly lack it entirely |
| Direct-API channel sync vs iCal | Guesty, Hostaway, Hospitable, Lodgify | iCal pulls availability only, on a 6–24 hour lag; API pushes price, min-stay, content and modifications in seconds |
| Unified inbox across OTA + email + SMS + WhatsApp | Hostaway, Guesty | The single most-praised feature in short-stay reviews |
| Embedded damage protection and guest verification | Guesty Shield | Replaces the deposit the channels won't let you hold |
| Dynamic pricing bundled at no extra cost | Hospitable | PriceLabs is ~$20/listing; bundling is a real price weapon |
| Branded direct-booking site with no per-booking fee | (nobody — Lodgify charges 1.9%, Hostaway 1.8%) | Escapes 15–20% OTA commission |
| Commercial lease intelligence — CAM reconciliation, CPI escalations, percentage rent | AppFolio, Yardi Breeze Premier, Re-Leased | Nobody in the SMB tier does this well |
| Custom report builder over any object | Re-Leased; largely absent elsewhere | The single most requested improvement across the whole category |
| Cleaner marketplace and photo checklists | Turno, Breezeway | Turnover is the operational bottleneck in short stays |

---

## 4. What users complain about — ranked

1. **Pricing opacity and surprise escalation.** Hostaway and AppFolio publish nothing. Buildium's flat tiers hide 30–50% in transaction fees. Lodgify hides a 1.9% booking fee. Minimums ($400 Yardi, $280–298 AppFolio, $250 Propertyware) make 20–100-unit operators pay 4–8× the advertised per-unit rate.
2. **Support collapse after the sale** — named industry-wide as "ghosting after onboarding".
3. **Reporting rigidity.** Forty canned reports and you still export to Excel because none filter by owner.
4. **Dated or heavy UI.** Guesty: "slow", "gets stuck", "messages don't appear until you refresh". Hostaway, Propertyware, Yardi Breeze, TenantCloud all criticised for navigation.
5. **Mobile gaps.** Rentec has no manager app; Avail has none either.
6. **Payments are the #1 functional pain** — slow funding, confusing refunds, silent reversals, opaque fees.
7. **Onboarding friction** — migrations run weeks to two months, often with $300–1,000+ setup fees.
8. **Integration fragility** and **punitive feature gating** (analytics, dynamic pricing, SMS, workflow automation all sold separately somewhere).

---

## 5. Short-term vs long-term: what a unified product must reconcile

| Dimension | Long-term (Buildium, AppFolio, Rentec) | Short-term (Guesty, Hostaway, Lodgify) | Reconciliation |
|---|---|---|---|
| Core object | Lease — a term contract | Reservation — a stay | One agreement entity with `lease` and `booking` subtypes sharing party, unit, money and documents |
| Calendar | Nearly absent; dates in a table | The primary work surface | One availability grid: leases as continuous bars, stays as blocks, with zoom levels |
| Pricing | Set at signing, changed at renewal | Changes daily; min-stay, LOS discounts, seasonality | One rate engine, two modes on the same unit |
| Distribution | One-way syndication | Two-way OTA API | A channel abstraction where a portal and an OTA are both "channels" |
| Turnover | A few times a year | Weekly or more; cleaning auto-scheduled off checkout | One work-order engine, different trigger cadence; serviced apartments trigger on length-of-stay rules |
| Damage cover | Escrowed deposit with jurisdiction rules | Channels block deposits; damage waivers and ID verification instead | A deposit module with three modes |
| Tax | No transient occupancy tax | Lodging tax 3–18%, **a liability, not income** | Occupancy-tax liability accounts, per-jurisdiction rates, remittance calendar |
| Communications | Low volume, scheduled | High volume, latency-sensitive, ~90% automated | One inbox with channel adapters; SLA metrics surfaced only where they matter |

**The hardest reconciliation** is the calendar and the ledger. Short-stay users treat availability as
the source of truth; long-term users treat the ledger as the source of truth. Altier must make the
availability grid and the ledger two views of the same agreement data.

---

## 6. Recommendations adopted by Altier

**IA moves adopted**
- Left rail organised **by object, not department** (Guesty's model) — `Dashboard · Availability · Properties · Bookings & leases · Clients · Payments · Maintenance · Notifications · Reports · Settings`. Buildium's department rail (`Accounting`, `Leasing`, `Communication`) forces users to know the org chart.
- **Tabbed record detail with lifecycle actions on the owning tab** (Buildium's pattern).
- **Role-scoped dashboards** with the maintenance card broken out **by pipeline stage**, not a single count (AppFolio's card, improved).
- **Slide-out / collapsible filter panel** rather than a permanent filter bar (DoorLoop's improvement).
- A **unified availability timeline** — rows are properties, columns are days — as the spine of the product.

**Where Altier deliberately improves on the field**
- **Rental model is a filter, not a fork.** No "STR mode" and "LTR mode". A mixed portfolio is one list, one calendar, one ledger.
- **The calendar is a first-class long-term surface**, not just a short-stay one: lease expiries, renewal windows and make-ready sit on the same timeline as bookings.
- **Show money before it moves.** Every payment surface states the fee, who pays it, and the funding date inline — the single most repeated complaint across five products.
- **Every table is a report.** Filter, sort, and a table view on every chart; nothing is gated behind an export.
- **Nothing essential is gated.** Analytics, reminder automation and reporting are core, not upsells.
- **Performance is a feature.** The calendar and lists must stay responsive at portfolio scale.

---

## Sources

**Buildium** — buildium.com/pricing, buildium.com/features, capterra.com/p/47428, g2.com/products/buildium/reviews, thepropertyceo.com/compare/buildium-review, softwareconnect.com/reviews/buildium, apmhelp.com (dashboard walkthrough), buildium.com/blog/owner-distributions-for-property-managers

**AppFolio** — appfolio.com/pricing, appfolio.com/ai, appfolio.com/articles/performers, appfolio.com/newsroom/appfolio-unleashes-realm-x-ai-capabilities, appfoliopricing.com, capterra.com/p/92228, balancedassetsolutions.com/appfolio-pricing-review-features

**Guesty** — guesty.com/pricing, guesty.com/features/multi-calendar, guesty.com/features/shield-suite, guesty.com/features/guestypay, help.guesty.com (dashboard and Multi-Calendar navigation), capterra.com/p/159377, stayfi.com/vrm-insider/2025/11/03/guesty-pms-review

**Hostaway** — hostaway.com/pricing, hostaway.com/features/channel-manager, hostaway.com/features/property-management-system, comparatifchannelmanager.fr/en/hostaway-pricing, learn.10xbnb.com/hostaway-review, softwareadvice.com/hotel-management/hostaway-profile

**Rentec Direct** — rentecdirect.com/pricing, rentecdirect.com/landlord-software, capterra.com/p/120753, softwareadvice.com/property/rentec-direct-property-management-profile

**DoorLoop** — doorloop.com/features, doorloop.com/blog/doorloop-revolutionizes-ui-to-take-property-management-software-to-the-next-level, support.doorloop.com (tenant portal overview), capterra.com/p/211768, g2.com/products/doorloop/reviews, trustpilot.com/review/doorloop.com

**Others** — capterra.com/p/133029 (TenantCloud), capterra.com/p/131924 + comparatifchannelmanager.fr/en/lodgify-pricing (Lodgify), yardibreeze.com/blog/2024/11/yardi-breeze-pricing + capterra.com/p/164741 (Yardi Breeze), capterra.com/p/166893 + renpro.com/is-innago-really-free (Innago), capterra.com/p/189280 + hospitable.com/airbnb-calendar-sync (Hospitable), softwareadvice.com/property/propertyware-profile + propertyware.com/property-management-reporting (Propertyware), capterra.com/p/181119 (Avail)

**Cross-cutting** — re-leased.com/property-operations/work-order-management-best-practices-for-commercial-property, re-leased.com/product/property-management-reporting, breezeway.io/serviced-apartments, turno.com/features/auto-scheduling, hostfully.com/blog/sync-airbnb-vrbo-calendars, avalara.com/mylodgetax/en/blog/2024/12/lodging-tax-implications-for-short-term-vs-long-term-rentals.html, baselane.com/resources/chart-of-accounts-short-term-rental-property, baselane.com/resources/security-deposit-alternatives, happy.co/resources/work-order-management, secondnature.com/blog/property-management-technology-trends
