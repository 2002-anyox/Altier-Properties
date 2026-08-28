-- ---------------------------------------------------------------
-- Arrival and departure
--
-- check_in and check_out are times of day — 15:00, 11:00 — agreed when
-- the agreement is drawn up. They record an expectation, and there was
-- nothing anywhere recording that it had been met: no way to say a guest
-- had arrived, and no way to say they had gone.
--
-- These two are that record. Null until each happens, and deliberately
-- separate from starts_on and ends_on, which are what was agreed. A guest
-- who arrives a day late or leaves a week early does not get the
-- agreement rewritten around them.
-- ---------------------------------------------------------------
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "arrived_on" date;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "departed_on" date;--> statement-breakpoint

-- A departure cannot precede an arrival, and neither can be recorded
-- against an agreement that was cancelled.
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_departure_after_arrival";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_departure_after_arrival"
  CHECK (departed_on IS NULL OR (arrived_on IS NOT NULL AND departed_on >= arrived_on));--> statement-breakpoint

-- Agreements already running were arrived at when they began; ones already
-- finished were left when they ended. Anything else would show every past
-- stay as a guest who never turned up.
UPDATE "bookings" SET arrived_on = starts_on
  WHERE arrived_on IS NULL AND status IN ('in_progress', 'completed');--> statement-breakpoint
UPDATE "bookings" SET departed_on = coalesce(ends_on, starts_on)
  WHERE departed_on IS NULL AND status = 'completed'
    AND coalesce(ends_on, starts_on) >= starts_on;--> statement-breakpoint
