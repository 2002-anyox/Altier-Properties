-- Credit notes, so a bill can follow the days actually spent.
--
-- A guest who books seven nights and leaves on the fourth has paid for
-- three nights nobody used, and a tenant who paid a quarter up front and
-- gave notice in the second month has paid for six weeks of an empty
-- home. Both need the money moved back — and neither may be handled by
-- editing the original charge. An invoice that quietly changes after it
-- was sent is not an invoice; it is an argument waiting to happen.
--
-- So the adjustment is its own document: a positive amount that counts
-- the other way. The amount column stays non-negative, which is what the
-- existing check constraint requires and what makes every figure in the
-- app readable, and the direction lives in the charge type instead.
--
-- Replaced rather than extended, following 0003: ALTER TYPE ... ADD VALUE
-- cannot be used by anything in the same transaction that adds it, and a
-- migration that is one atomic step is worth the extra lines.
ALTER TYPE "public"."charge_type" RENAME TO "charge_type_before_credits";--> statement-breakpoint

CREATE TYPE "public"."charge_type" AS ENUM(
	'rent', 'advance', 'booking', 'deposit', 'utilities', 'service_fee',
	'late_fee', 'maintenance_recharge', 'credit_note'
);--> statement-breakpoint

ALTER TABLE "invoices" ALTER COLUMN "type" TYPE "public"."charge_type"
	USING "type"::text::"public"."charge_type";--> statement-breakpoint

DROP TYPE "public"."charge_type_before_credits";--> statement-breakpoint

-- A credit note gives back part of what a stay was charged, so it always
-- belongs to the agreement it is adjusting. Without this a refund could
-- float free of any tenancy and never appear in that tenancy's balance.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credit_has_booking"
	CHECK ("type" <> 'credit_note' OR "booking_id" IS NOT NULL);
