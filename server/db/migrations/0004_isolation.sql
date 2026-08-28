-- ---------------------------------------------------------------
-- Isolation, enforced by the database
--
-- Until now the API connected as an owning superuser, which bypasses
-- row-level security entirely: policies would have been decoration. So
-- this creates a role they apply to, and the API takes it for the length
-- of each request.
--
-- The session says who is asking and which workspace they claim. A policy
-- believes neither on its own: it looks the pairing up in
-- organization_members and agrees only if a row says the membership is
-- real and active. So the worst a mistake in the API can do is name a
-- membership that does not exist, and see nothing at all.
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'altier_app') THEN
    CREATE ROLE altier_app NOLOGIN;
  END IF;
END $$;--> statement-breakpoint

-- The API connects as the owning role and takes this one for the length
-- of each request. SET ROLE only works between roles the connecting one
-- is a member of, and a superuser is a member of everything — so this
-- matters on a managed Postgres, where the account you are given is the
-- owner and not a superuser.
DO $$
BEGIN
  IF NOT pg_has_role(current_user, 'altier_app', 'MEMBER') THEN
    EXECUTE format('GRANT altier_app TO %I', current_user);
  END IF;
END $$;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO altier_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO altier_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO altier_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO altier_app;--> statement-breakpoint

-- ---------------------------------------------------------------
-- Who is asking
-- ---------------------------------------------------------------

-- The profile the request is running as, or null. Null makes every
-- policy below fail closed, which is the right answer for a query that
-- forgot to say who it was for.
CREATE OR REPLACE FUNCTION altier_profile() RETURNS text
  LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('altier.profile_id', true), '')
$$;--> statement-breakpoint

-- Altier's own support staff, and nothing a customer can grant.
CREATE OR REPLACE FUNCTION altier_is_super_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce((SELECT is_super_admin FROM profiles WHERE id = altier_profile()), false)
$$;--> statement-breakpoint

-- The workspace this request may see: the claimed one, but only if the
-- claim matches an active membership. The membership table is the
-- authority; the session variable is only a proposal.
CREATE OR REPLACE FUNCTION altier_org() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT om.organization_id
  FROM organization_members om
  WHERE om.profile_id = altier_profile()
    AND om.organization_id = nullif(current_setting('altier.organization_id', true), '')
    AND om.status = 'active'
  LIMIT 1
$$;--> statement-breakpoint

-- The membership itself, for the per-property rules a manager and staff
-- member are held to.
CREATE OR REPLACE FUNCTION altier_member() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT om.id FROM organization_members om
  WHERE om.profile_id = altier_profile()
    AND om.organization_id = altier_org()
    AND om.status = 'active'
  LIMIT 1
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION altier_role() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT om.role::text FROM organization_members om WHERE om.id = altier_member()
$$;--> statement-breakpoint

-- The client a tenant login speaks for; null for staff.
CREATE OR REPLACE FUNCTION altier_tenant_client() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT om.client_id FROM organization_members om
  WHERE om.id = altier_member() AND om.role = 'tenant'
$$;--> statement-breakpoint

-- Whether this request may reach a given property. Owners and
-- accountants see the whole workspace; managers and staff see what they
-- have been assigned; a tenant sees where they hold an agreement.
CREATE OR REPLACE FUNCTION altier_may_see_property(pid text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE
    WHEN altier_is_super_admin() THEN true
    WHEN altier_role() IN ('owner', 'accountant') THEN true
    WHEN altier_role() IN ('manager', 'staff') THEN EXISTS (
      SELECT 1 FROM member_properties mp
      WHERE mp.member_id = altier_member() AND mp.property_id = pid)
    WHEN altier_role() = 'tenant' THEN EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.property_id = pid AND b.client_id = altier_tenant_client())
    ELSE false
  END
$$;--> statement-breakpoint

-- Creating a login for somebody who does not have one yet.
--
-- The policy on profiles lets a request see itself and its colleagues,
-- and write neither — which is right, and leaves no way to add the first
-- row for a new colleague. This is that way, and it is deliberately the
-- narrowest one: it creates an account and refuses if the address already
-- has one. It cannot touch an existing profile, so it cannot be turned
-- into a way to take somebody's account over by adding their address to a
-- workspace they never joined. Attaching an existing person to a
-- workspace is what an invitation is for, and they have to accept it.
CREATE OR REPLACE FUNCTION altier_create_profile(
  p_id text, p_email text, p_name text, p_phone text, p_password_hash text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'account exists' USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO profiles (id, name, email, phone, password_hash, password_set_at)
  VALUES (p_id, p_name, lower(p_email), coalesce(p_phone, ''), p_password_hash,
          CASE WHEN p_password_hash IS NULL THEN NULL ELSE now() END);
  RETURN p_id;
END $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION altier_create_profile(text, text, text, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION altier_create_profile(text, text, text, text, text) TO altier_app;--> statement-breakpoint

-- ---------------------------------------------------------------
-- The policies
--
-- One shape, applied everywhere: the row's organization must be the one
-- this request has an active membership in. Super admins are the single
-- exception, and that flag lives on a profile no customer can write.
-- ---------------------------------------------------------------
ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "properties" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "properties_isolation" ON "properties";--> statement-breakpoint
CREATE POLICY "properties_isolation" ON "properties" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(id))) WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(id)));--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clients_isolation" ON "clients";--> statement-breakpoint
CREATE POLICY "clients_isolation" ON "clients" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND CASE
    WHEN altier_role() IN ('owner', 'accountant') THEN true
    WHEN altier_role() = 'tenant' THEN id = altier_tenant_client()
    ELSE EXISTS (SELECT 1 FROM bookings b
                 WHERE b.client_id = clients.id AND altier_may_see_property(b.property_id))
  END)) WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND CASE
    WHEN altier_role() IN ('owner', 'accountant') THEN true
    WHEN altier_role() = 'tenant' THEN id = altier_tenant_client()
    ELSE EXISTS (SELECT 1 FROM bookings b
                 WHERE b.client_id = clients.id AND altier_may_see_property(b.property_id))
  END));--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bookings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "bookings_isolation" ON "bookings";--> statement-breakpoint
CREATE POLICY "bookings_isolation" ON "bookings" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id))) WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id)));--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "invoices_isolation" ON "invoices";--> statement-breakpoint
CREATE POLICY "invoices_isolation" ON "invoices" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id))) WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id)));--> statement-breakpoint
ALTER TABLE "maintenance_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "maintenance_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "maintenance_requests_isolation" ON "maintenance_requests";--> statement-breakpoint
CREATE POLICY "maintenance_requests_isolation" ON "maintenance_requests" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id))) WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id)));--> statement-breakpoint
ALTER TABLE "communications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "communications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "communications_isolation" ON "communications";--> statement-breakpoint
CREATE POLICY "communications_isolation" ON "communications" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND EXISTS (SELECT 1 FROM clients c WHERE c.id = communications.client_id))) WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND EXISTS (SELECT 1 FROM clients c WHERE c.id = communications.client_id)));--> statement-breakpoint
ALTER TABLE "occupancy_spells" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "occupancy_spells" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "occupancy_spells_isolation" ON "occupancy_spells";--> statement-breakpoint
CREATE POLICY "occupancy_spells_isolation" ON "occupancy_spells" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id))) WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id)));--> statement-breakpoint
ALTER TABLE "client_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_documents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "client_documents_isolation" ON "client_documents";--> statement-breakpoint
CREATE POLICY "client_documents_isolation" ON "client_documents" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND EXISTS (SELECT 1 FROM clients c WHERE c.id = client_documents.client_id))) WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND EXISTS (SELECT 1 FROM clients c WHERE c.id = client_documents.client_id)));--> statement-breakpoint
ALTER TABLE "property_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "property_documents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "property_documents_isolation" ON "property_documents";--> statement-breakpoint
CREATE POLICY "property_documents_isolation" ON "property_documents" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id))) WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id)));--> statement-breakpoint
ALTER TABLE "property_maintenance_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "property_maintenance_notes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "property_maintenance_notes_isolation" ON "property_maintenance_notes";--> statement-breakpoint
CREATE POLICY "property_maintenance_notes_isolation" ON "property_maintenance_notes" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id))) WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id)));--> statement-breakpoint
ALTER TABLE "maintenance_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "maintenance_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "maintenance_events_isolation" ON "maintenance_events";--> statement-breakpoint
CREATE POLICY "maintenance_events_isolation" ON "maintenance_events" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR organization_id = altier_org()) WITH CHECK (altier_is_super_admin() OR organization_id = altier_org());--> statement-breakpoint
ALTER TABLE "property_amenities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "property_amenities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "property_amenities_isolation" ON "property_amenities";--> statement-breakpoint
CREATE POLICY "property_amenities_isolation" ON "property_amenities" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id))) WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND altier_may_see_property(property_id)));--> statement-breakpoint
ALTER TABLE "client_properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_properties" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "client_properties_isolation" ON "client_properties";--> statement-breakpoint
CREATE POLICY "client_properties_isolation" ON "client_properties" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND EXISTS (SELECT 1 FROM clients c WHERE c.id = client_properties.client_id))) WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND EXISTS (SELECT 1 FROM clients c WHERE c.id = client_properties.client_id)));--> statement-breakpoint
ALTER TABLE "reminder_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminder_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "reminder_settings_isolation" ON "reminder_settings";--> statement-breakpoint
CREATE POLICY "reminder_settings_isolation" ON "reminder_settings" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR organization_id = altier_org()) WITH CHECK (altier_is_super_admin() OR organization_id = altier_org());--> statement-breakpoint
ALTER TABLE "notification_reads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_reads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "notification_reads_isolation" ON "notification_reads";--> statement-breakpoint
CREATE POLICY "notification_reads_isolation" ON "notification_reads" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR organization_id = altier_org()) WITH CHECK (altier_is_super_admin() OR organization_id = altier_org());--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "invitations_isolation" ON "invitations";--> statement-breakpoint
CREATE POLICY "invitations_isolation" ON "invitations" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR organization_id = altier_org()) WITH CHECK (altier_is_super_admin() OR organization_id = altier_org());--> statement-breakpoint
ALTER TABLE "invitation_properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitation_properties" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "invitation_properties_isolation" ON "invitation_properties";--> statement-breakpoint
CREATE POLICY "invitation_properties_isolation" ON "invitation_properties" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR EXISTS (SELECT 1 FROM invitations p WHERE p.id = invitation_properties.invitation_id AND p.organization_id = altier_org())) WITH CHECK (altier_is_super_admin() OR EXISTS (SELECT 1 FROM invitations p WHERE p.id = invitation_properties.invitation_id AND p.organization_id = altier_org()));--> statement-breakpoint
ALTER TABLE "member_properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_properties" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "member_properties_isolation" ON "member_properties";--> statement-breakpoint
-- Both ends have to be in this workspace. Checking only the membership
-- would let a workspace assign one of its own staff a property belonging
-- to somebody else, and an assignment is what altier_may_see_property()
-- reads — so that would be a way to widen your own access by writing a
-- row. The property is looked up with a plain SELECT, which the policy on
-- properties has already narrowed to this workspace.
CREATE POLICY "member_properties_isolation" ON "member_properties" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (EXISTS (SELECT 1 FROM organization_members p WHERE p.id = member_properties.member_id AND p.organization_id = altier_org()) AND EXISTS (SELECT 1 FROM properties q WHERE q.id = member_properties.property_id AND q.organization_id = altier_org()))) WITH CHECK (altier_is_super_admin() OR (EXISTS (SELECT 1 FROM organization_members p WHERE p.id = member_properties.member_id AND p.organization_id = altier_org()) AND EXISTS (SELECT 1 FROM properties q WHERE q.id = member_properties.property_id AND q.organization_id = altier_org())));--> statement-breakpoint
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "organization_members_isolation" ON "organization_members";--> statement-breakpoint
CREATE POLICY "organization_members_isolation" ON "organization_members" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR organization_id = altier_org()) WITH CHECK (altier_is_super_admin() OR organization_id = altier_org());--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "organizations_isolation" ON "organizations";--> statement-breakpoint
CREATE POLICY "organizations_isolation" ON "organizations" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR id = altier_org()) WITH CHECK (altier_is_super_admin() OR id = altier_org());--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "subscriptions_isolation" ON "subscriptions";--> statement-breakpoint
CREATE POLICY "subscriptions_isolation" ON "subscriptions" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR organization_id = altier_org()) WITH CHECK (altier_is_super_admin() OR organization_id = altier_org());--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "profiles_isolation" ON "profiles";--> statement-breakpoint
CREATE POLICY "profiles_isolation" ON "profiles" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR id = altier_profile() OR EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.profile_id = profiles.id AND om.organization_id = altier_org())) WITH CHECK (altier_is_super_admin() OR id = altier_profile() OR EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.profile_id = profiles.id AND om.organization_id = altier_org()));--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "sessions_isolation" ON "sessions";--> statement-breakpoint
CREATE POLICY "sessions_isolation" ON "sessions" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR profile_id = altier_profile()) WITH CHECK (altier_is_super_admin() OR profile_id = altier_profile());--> statement-breakpoint
ALTER TABLE "identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "identities_isolation" ON "identities";--> statement-breakpoint
CREATE POLICY "identities_isolation" ON "identities" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR profile_id = altier_profile()) WITH CHECK (altier_is_super_admin() OR profile_id = altier_profile());--> statement-breakpoint
