/* ------------------------------------------------------------------ *
 * A portal login cannot outlive the record it was granted from.
 *
 * organization_members.client_id named a client with nothing holding it
 * there, and deleting the client left the membership behind. The login
 * went on working, and because the tenant policy matches on that id —
 * and ids are supplied by the caller — it read whatever record next took
 * the id. With the client gone there was also no screen left to close
 * the login from.
 *
 * The orphans are withdrawn first, then the key makes the shape
 * impossible. Their profiles are left alone: an account may be somebody's
 * way into another workspace, and this is not the place to judge that.
 * ------------------------------------------------------------------ */

DELETE FROM organization_members om
WHERE om.client_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = om.client_id);--> statement-breakpoint

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_client_id_clients_id_fk
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;--> statement-breakpoint

/* ------------------------------------------------------------------ *
 * Granting portal access has to know whether an account already exists.
 *
 * The check ran as the caller, so it only ever saw profiles in the
 * caller's own workspace. For an address belonging to anybody else it
 * found nothing, went ahead, and altier_create_profile raised on its own
 * duplicate check — a 500 carrying the statement and the password hash,
 * where the code meant to return a refusal.
 *
 * Reading unscoped is the point here, so the check is defined the same
 * way the insert already is. It answers only yes or no: no name, no
 * workspace, nothing about whose account it is.
 * ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION altier_profile_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE lower(email) = lower(p_email))
$$;--> statement-breakpoint
