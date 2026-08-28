-- ---------------------------------------------------------------
-- Where the workspace is
--
-- Dates stamped by the server were UTC. A payment recorded at one in the
-- morning in Kampala was stored as the previous day, because UTC had not
-- reached midnight yet — and the screen, which reads the browser's own
-- calendar, said otherwise. Both were confident and they disagreed.
--
-- A calendar day is a fact about a place. This records which place, so
-- "today" means the same thing on the screen and in the ledger. Uganda is
-- the default because that is who this is built for; a workspace
-- elsewhere sets its own.
-- ---------------------------------------------------------------
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'Africa/Kampala' NOT NULL;--> statement-breakpoint
