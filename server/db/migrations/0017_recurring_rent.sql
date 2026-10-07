/* ------------------------------------------------------------------ *
 * One rent charge per agreement per period.
 *
 * Rent is now raised as it comes due, on demand rather than by a job —
 * the API runs serverless, with no process alive between requests to run
 * one. So two people opening the app in the same minute can both find
 * October unbilled. A lock serialises them in the ordinary case; this is
 * what makes a second October impossible in every case.
 * ------------------------------------------------------------------ */

CREATE UNIQUE INDEX invoices_rent_period
  ON invoices (booking_id, earns_from)
  WHERE type = 'rent' AND booking_id IS NOT NULL;--> statement-breakpoint
