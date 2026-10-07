/* ------------------------------------------------------------------ *
 * Ownership stays with owners, whatever the permission matrix says.
 *
 * "Manage team" may be ticked for a manager, and the row policies on
 * organization_members only ask whether a row is in the workspace — so a
 * manager holding it could write role = 'owner' on anybody, themselves
 * included, and nothing below the routes objected. The routes now refuse;
 * this makes the database refuse the same things, so a route that forgets
 * to ask cannot hand the workspace over.
 *
 * Work that runs with no membership in this workspace — signing up,
 * accepting an invitation, the support desk — has no role here and is
 * left to the routes that own those paths.
 * ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION altier_guard_ownership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  caller text := altier_role();
BEGIN
  IF caller IS NULL OR caller = 'owner' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.role = 'owner' THEN
    RAISE EXCEPTION 'only an owner can change an owner' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.role = 'owner' THEN
    RAISE EXCEPTION 'only an owner can make an owner' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.id = altier_member() AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'only an owner can change their own role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;--> statement-breakpoint

CREATE TRIGGER organization_members_owner_ceiling
  BEFORE INSERT OR UPDATE OR DELETE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION altier_guard_ownership();--> statement-breakpoint

/* An invitation to be an owner is a way of making one. */
CREATE OR REPLACE FUNCTION altier_guard_owner_invitation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  caller text := altier_role();
BEGIN
  IF caller IS NOT NULL AND caller <> 'owner' AND NEW.role = 'owner' THEN
    RAISE EXCEPTION 'only an owner can invite an owner' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint

CREATE TRIGGER invitations_owner_ceiling
  BEFORE INSERT OR UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION altier_guard_owner_invitation();--> statement-breakpoint

/* The matrix decides what every role reaches, so only an owner writes it. */
CREATE OR REPLACE FUNCTION altier_guard_permission_matrix()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  caller text := altier_role();
BEGIN
  IF caller IS NOT NULL AND caller <> 'owner' THEN
    RAISE EXCEPTION 'only an owner can change what roles reach' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;--> statement-breakpoint

CREATE TRIGGER role_permissions_owner_ceiling
  BEFORE INSERT OR UPDATE OR DELETE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION altier_guard_permission_matrix();--> statement-breakpoint
