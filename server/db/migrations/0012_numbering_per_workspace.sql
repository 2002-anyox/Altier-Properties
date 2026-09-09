-- Reference numbers belong to a workspace, not to the world.
--
-- Every generator in the app starts its numbering from a fixed floor —
-- properties at ALT-P-001, agreements at ALT-4001, charges at
-- ALT-INV-5001 — and continues from the highest number it can already
-- see. What it can see is its own workspace, because that is all the
-- row-level policies will show it.
--
-- So the first customer to raise a charge takes ALT-INV-5001, and the
-- second customer to raise one asks for ALT-INV-5001 too and is refused
-- by a UNIQUE constraint spanning every organization in the database.
-- Their agreement does not half-land — the transaction takes the whole
-- write with it — but it does not land at all either, and the reason on
-- screen is a duplicate key on a number they have never seen.
--
-- One customer never noticed. Two do, immediately, and the second one
-- cannot create anything at all.
--
-- The identifier is per workspace, so the constraint is too. Two
-- landlords both having an ALT-INV-5001 is not a collision; it is what
-- separate books look like.
ALTER TABLE "properties" DROP CONSTRAINT IF EXISTS "properties_code_unique";--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_reference_unique";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_number_unique";--> statement-breakpoint
ALTER TABLE "maintenance_requests" DROP CONSTRAINT IF EXISTS "maintenance_requests_reference_unique";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "properties_code_per_org"
	ON "properties" USING btree ("organization_id", "code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_reference_per_org"
	ON "bookings" USING btree ("organization_id", "reference");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_number_per_org"
	ON "invoices" USING btree ("organization_id", "number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_requests_reference_per_org"
	ON "maintenance_requests" USING btree ("organization_id", "reference");
