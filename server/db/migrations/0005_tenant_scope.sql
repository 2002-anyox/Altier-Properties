-- ---------------------------------------------------------------
-- A tenant sees their own records, and only their own
--
-- 0004 narrowed a tenant login to the properties they hold an agreement
-- on, which was the wrong unit of measurement. A block of flats is one
-- property: every renter in it held an agreement on it, so each of them
-- could read the others' rent charges, the names and revenue of whoever
-- lived there before, the deeds and inspection reports the landlord keeps
-- on the building, the staff directory, and the landlord's own
-- subscription.
--
-- The property was never the right boundary for this role. The client
-- record is. Below, every table a tenant can reach is narrowed to rows
-- that name them, and the ones that have no such column — a maintenance
-- job, an inspection report, a previous stay — are closed to them
-- entirely rather than guessed at.
-- ---------------------------------------------------------------

-- Reads more clearly at the end of each policy than altier_role() = 'tenant'
-- repeated fourteen times, and is the thing every one of them turns on.
CREATE OR REPLACE FUNCTION altier_is_tenant() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT altier_role() = 'tenant' $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION altier_is_tenant() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION altier_is_tenant() TO altier_app;--> statement-breakpoint

-- Their own agreements and their own charges — decided by whose name is
-- on the row, not by which building it is about. Adding the property test
-- as well would hide a charge from the person who owes it the moment
-- their tenancy there ended, which is exactly when they most want to see
-- it. Staff are still held to the properties they were assigned.
DROP POLICY IF EXISTS "bookings_isolation" ON "bookings";--> statement-breakpoint
CREATE POLICY "bookings_isolation" ON "bookings" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND CASE
    WHEN altier_is_tenant() THEN client_id = altier_tenant_client()
    ELSE altier_may_see_property(property_id) END))
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND CASE
    WHEN altier_is_tenant() THEN client_id = altier_tenant_client()
    ELSE altier_may_see_property(property_id) END));--> statement-breakpoint

DROP POLICY IF EXISTS "invoices_isolation" ON "invoices";--> statement-breakpoint
CREATE POLICY "invoices_isolation" ON "invoices" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND CASE
    WHEN altier_is_tenant() THEN client_id = altier_tenant_client()
    ELSE altier_may_see_property(property_id) END))
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND CASE
    WHEN altier_is_tenant() THEN client_id = altier_tenant_client()
    ELSE altier_may_see_property(property_id) END));--> statement-breakpoint

-- A maintenance request records who reported it as a name typed into a
-- box, not as a link to anybody, so there is no honest way to hand a
-- tenant "their own". Closed until there is one.
DROP POLICY IF EXISTS "maintenance_requests_isolation" ON "maintenance_requests";--> statement-breakpoint
CREATE POLICY "maintenance_requests_isolation" ON "maintenance_requests" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org()
    AND altier_may_see_property(property_id) AND NOT altier_is_tenant()))
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org()
    AND altier_may_see_property(property_id) AND NOT altier_is_tenant()));--> statement-breakpoint

DROP POLICY IF EXISTS "maintenance_events_isolation" ON "maintenance_events";--> statement-breakpoint
CREATE POLICY "maintenance_events_isolation" ON "maintenance_events" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND NOT altier_is_tenant()))
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND NOT altier_is_tenant()));--> statement-breakpoint

-- The landlord's papers on the building, and the notes staff keep on it.
DROP POLICY IF EXISTS "property_documents_isolation" ON "property_documents";--> statement-breakpoint
CREATE POLICY "property_documents_isolation" ON "property_documents" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org()
    AND altier_may_see_property(property_id) AND NOT altier_is_tenant()))
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org()
    AND altier_may_see_property(property_id) AND NOT altier_is_tenant()));--> statement-breakpoint

DROP POLICY IF EXISTS "property_maintenance_notes_isolation" ON "property_maintenance_notes";--> statement-breakpoint
CREATE POLICY "property_maintenance_notes_isolation" ON "property_maintenance_notes" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org()
    AND altier_may_see_property(property_id) AND NOT altier_is_tenant()))
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org()
    AND altier_may_see_property(property_id) AND NOT altier_is_tenant()));--> statement-breakpoint

-- Who lived there before, what they paid, and for how long.
DROP POLICY IF EXISTS "occupancy_spells_isolation" ON "occupancy_spells";--> statement-breakpoint
CREATE POLICY "occupancy_spells_isolation" ON "occupancy_spells" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org()
    AND altier_may_see_property(property_id) AND NOT altier_is_tenant()))
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org()
    AND altier_may_see_property(property_id) AND NOT altier_is_tenant()));--> statement-breakpoint

-- Who else works here. A tenant sees the one membership that is theirs,
-- which is also what narrows profiles: that policy asks this table who is
-- a colleague, and for a tenant the answer is nobody.
DROP POLICY IF EXISTS "organization_members_isolation" ON "organization_members";--> statement-breakpoint
CREATE POLICY "organization_members_isolation" ON "organization_members" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org()
    AND (NOT altier_is_tenant() OR profile_id = altier_profile())))
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org()
    AND (NOT altier_is_tenant() OR profile_id = altier_profile())));--> statement-breakpoint

-- How the business is run and what it pays.
DROP POLICY IF EXISTS "subscriptions_isolation" ON "subscriptions";--> statement-breakpoint
CREATE POLICY "subscriptions_isolation" ON "subscriptions" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND NOT altier_is_tenant()))
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND NOT altier_is_tenant()));--> statement-breakpoint

DROP POLICY IF EXISTS "reminder_settings_isolation" ON "reminder_settings";--> statement-breakpoint
CREATE POLICY "reminder_settings_isolation" ON "reminder_settings" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND NOT altier_is_tenant()))
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND NOT altier_is_tenant()));--> statement-breakpoint

DROP POLICY IF EXISTS "invitations_isolation" ON "invitations";--> statement-breakpoint
CREATE POLICY "invitations_isolation" ON "invitations" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND NOT altier_is_tenant()))
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND NOT altier_is_tenant()));--> statement-breakpoint

DROP POLICY IF EXISTS "member_properties_isolation" ON "member_properties";--> statement-breakpoint
CREATE POLICY "member_properties_isolation" ON "member_properties" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (NOT altier_is_tenant()
    AND EXISTS (SELECT 1 FROM organization_members p WHERE p.id = member_properties.member_id AND p.organization_id = altier_org())
    AND EXISTS (SELECT 1 FROM properties q WHERE q.id = member_properties.property_id AND q.organization_id = altier_org())))
  WITH CHECK (altier_is_super_admin() OR (NOT altier_is_tenant()
    AND EXISTS (SELECT 1 FROM organization_members p WHERE p.id = member_properties.member_id AND p.organization_id = altier_org())
    AND EXISTS (SELECT 1 FROM properties q WHERE q.id = member_properties.property_id AND q.organization_id = altier_org())));--> statement-breakpoint
