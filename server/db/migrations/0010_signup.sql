-- ---------------------------------------------------------------
-- Letting somebody in through the front door
--
-- Until now the only way to exist here was to be invited, or to be the
-- very first account on an empty database. That was right while Altier
-- was one deployment for one company. It stopped being right when
-- organizations, subscriptions and seats arrived: that is the machinery
-- of many customers, with no way for a customer to arrive.
--
-- A public sign-up creates rows for anybody who asks, so it needs a
-- throttle. This is it: the hash of the caller's address and the moment
-- they asked. Hashed rather than stored, because the address is only
-- ever compared against itself and nobody needs to read it back.
--
-- No organization_id, because it belongs to no workspace. RLS is enabled
-- but deliberately NOT forced: the owning role writes it during sign-up,
-- before any session exists, while altier_app has no policy and so can
-- never read or write it from inside a request.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "signup_attempts" (
  "id" bigserial PRIMARY KEY,
  "ip_hash" text NOT NULL,
  "at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "signup_attempts_ip_idx"
  ON "signup_attempts" USING btree ("ip_hash", "at");--> statement-breakpoint

ALTER TABLE "signup_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- The trial has always been written and never read. Seven days, and an
-- end date that means something: see altier_subscription_open() below.
ALTER TABLE "subscriptions"
  DROP CONSTRAINT IF EXISTS "subscriptions_trial_after_start";--> statement-breakpoint
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_trial_after_start"
  CHECK ("trial_ends_at" IS NULL OR "current_period_start" IS NULL
         OR "trial_ends_at" >= "current_period_start");--> statement-breakpoint
