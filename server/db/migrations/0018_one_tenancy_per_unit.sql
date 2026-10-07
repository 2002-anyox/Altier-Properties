/* ------------------------------------------------------------------ *
 * One live agreement per unit at a time.
 *
 * Nothing checked a unit's existing agreements before adding another, so
 * a second tenant could be checked into a home somebody was living in,
 * each raising their own rent. The route now refuses with a reason; this
 * is the rule itself, so it holds under two requests at once and on any
 * path a route forgets.
 *
 * An agreement occupies its unit from its start until whoever was in it
 * left, or until the term ends if nobody has yet — the end exclusive, so
 * a renewal may begin the day the last one ends. A cancelled agreement
 * occupies nothing.
 * ------------------------------------------------------------------ */

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE bookings
  ADD CONSTRAINT bookings_one_tenancy_per_unit
  EXCLUDE USING gist (
    property_id WITH =,
    daterange(starts_on, coalesce(departed_on, ends_on), '[)') WITH &&
  ) WHERE (status <> 'cancelled');--> statement-breakpoint
