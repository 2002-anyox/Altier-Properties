/* ------------------------------------------------------------------ *
 * A manager can create the things a manager is for.
 *
 * Every policy here was FOR ALL, so the rule for writing a row was the
 * rule for reading it — and for a manager the read rules can only be met
 * by a row that already exists:
 *
 *   properties  visible through a member_properties row, which can only
 *               be written for a property the manager can already see;
 *   clients     visible through a booking on one of their properties,
 *               which can only be made for a client they can already see.
 *
 * So the manager role, granted edit:properties and edit:clients by
 * default, could create neither, and the refusal surfaced as a 500.
 *
 * Reads keep their rules. Writes are split out so that creating a row
 * needs only the workspace, and what a manager may *see* afterwards is
 * settled by the link they create with it.
 * ------------------------------------------------------------------ */

/* Ownership checks that must not depend on what the caller can already
   see — the whole problem was policies that could only be satisfied by
   rows the caller could not yet read. */
CREATE OR REPLACE FUNCTION altier_property_in_org(pid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM properties WHERE id = pid AND organization_id = altier_org())
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION altier_client_in_org(cid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM clients WHERE id = cid AND organization_id = altier_org())
$$;--> statement-breakpoint

/* Whether a client is linked to a property the caller looks after. Read
   unscoped, because client_properties' own policy refers to clients and
   a policy on clients that read it directly would recurse. */
CREATE OR REPLACE FUNCTION altier_client_linked_to_visible(cid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM client_properties cp
    WHERE cp.client_id = cid AND altier_may_see_property(cp.property_id)
  )
$$;--> statement-breakpoint

/* The one way a manager comes to see a property nobody assigned them:
   by having just created it. Narrow on purpose — only a property in this
   workspace that nobody is assigned to and nobody has ever been booked
   into, so it cannot be used to reach an existing unit. Does nothing for
   an owner or accountant, who see everything already. */
CREATE OR REPLACE FUNCTION altier_claim_property(pid text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF altier_role() NOT IN ('manager', 'staff') THEN
    RETURN;
  END IF;
  IF NOT altier_property_in_org(pid) THEN
    RAISE EXCEPTION 'no such property here' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM member_properties WHERE property_id = pid)
     OR EXISTS (SELECT 1 FROM bookings WHERE property_id = pid) THEN
    RAISE EXCEPTION 'that property is already in use' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO member_properties (member_id, property_id)
  VALUES (altier_member(), pid)
  ON CONFLICT DO NOTHING;
END $$;--> statement-breakpoint

/* ------------------------------ properties ------------------------- */

DROP POLICY IF EXISTS properties_isolation ON properties;--> statement-breakpoint

CREATE POLICY properties_read ON properties FOR SELECT
  USING (altier_is_super_admin()
    OR (organization_id = altier_org() AND altier_may_see_property(id)));--> statement-breakpoint

CREATE POLICY properties_create ON properties FOR INSERT
  WITH CHECK (altier_is_super_admin()
    OR (organization_id = altier_org() AND NOT altier_is_tenant()));--> statement-breakpoint

CREATE POLICY properties_change ON properties FOR UPDATE
  USING (altier_is_super_admin()
    OR (organization_id = altier_org() AND altier_may_see_property(id)))
  WITH CHECK (altier_is_super_admin()
    OR (organization_id = altier_org() AND altier_may_see_property(id)));--> statement-breakpoint

CREATE POLICY properties_remove ON properties FOR DELETE
  USING (altier_is_super_admin()
    OR (organization_id = altier_org() AND altier_may_see_property(id)));--> statement-breakpoint

/* -------------------------------- clients -------------------------- */

DROP POLICY IF EXISTS clients_isolation ON clients;--> statement-breakpoint

CREATE POLICY clients_read ON clients FOR SELECT
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND
    CASE
      WHEN altier_role() IN ('owner', 'accountant') THEN true
      WHEN altier_role() = 'tenant' THEN id = altier_tenant_client()
      ELSE EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.client_id = clients.id AND altier_may_see_property(b.property_id))
        OR altier_client_linked_to_visible(clients.id)
    END));--> statement-breakpoint

CREATE POLICY clients_create ON clients FOR INSERT
  WITH CHECK (altier_is_super_admin()
    OR (organization_id = altier_org() AND NOT altier_is_tenant()));--> statement-breakpoint

CREATE POLICY clients_change ON clients FOR UPDATE
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND
    CASE
      WHEN altier_role() IN ('owner', 'accountant') THEN true
      WHEN altier_role() = 'tenant' THEN false
      ELSE EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.client_id = clients.id AND altier_may_see_property(b.property_id))
        OR altier_client_linked_to_visible(clients.id)
    END))
  WITH CHECK (altier_is_super_admin()
    OR (organization_id = altier_org() AND NOT altier_is_tenant()));--> statement-breakpoint

CREATE POLICY clients_remove ON clients FOR DELETE
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND
    CASE
      WHEN altier_role() IN ('owner', 'accountant') THEN true
      WHEN altier_role() = 'tenant' THEN false
      ELSE EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.client_id = clients.id AND altier_may_see_property(b.property_id))
        OR altier_client_linked_to_visible(clients.id)
    END));--> statement-breakpoint

/* --------------------------- client_properties ---------------------- *
 * A link between a client and a unit is about the unit as much as the
 * client, so every one of these now has to name a property the caller
 * looks after. Before, only the client had to be visible: a manager with
 * one unit could read a client's links to three others, and — since an
 * edit replaces the whole set — sever them.
 * ------------------------------------------------------------------- */

DROP POLICY IF EXISTS client_properties_isolation ON client_properties;--> statement-breakpoint

CREATE POLICY client_properties_read ON client_properties FOR SELECT
  USING (altier_is_super_admin() OR (organization_id = altier_org()
    AND EXISTS (SELECT 1 FROM clients c WHERE c.id = client_properties.client_id)
    AND (altier_is_tenant() OR altier_may_see_property(property_id))));--> statement-breakpoint

CREATE POLICY client_properties_create ON client_properties FOR INSERT
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org()
    AND NOT altier_is_tenant()
    AND altier_client_in_org(client_id)
    AND altier_may_see_property(property_id)));--> statement-breakpoint

CREATE POLICY client_properties_remove ON client_properties FOR DELETE
  USING (altier_is_super_admin() OR (organization_id = altier_org()
    AND NOT altier_is_tenant()
    AND altier_client_in_org(client_id)
    AND altier_may_see_property(property_id)));--> statement-breakpoint
