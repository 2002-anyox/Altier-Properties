-- ---------------------------------------------------------------
-- What each role reaches, per workspace
--
-- The matrix was a constant compiled into the app, and Settings drew it
-- as ticks nobody could press. Every customer got the same answer to a
-- question that is theirs: whether their accountant may edit a tenancy,
-- whether their managers may see the books.
--
-- A row here is a deliberate departure from the built-in default. No
-- rows means the defaults stand, which is what every workspace starts
-- with and most will keep — so this table is empty until somebody
-- actually changes something, and reading it is cheap.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "role_permissions" (
	"organization_id" text NOT NULL,
	"role" "role" NOT NULL,
	"permission" text NOT NULL,
	"allowed" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("organization_id","role","permission")
);--> statement-breakpoint

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "role_permissions" TO altier_app;--> statement-breakpoint

ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Everybody in the workspace may read it — the interface has to know what
-- to draw, and a role learning what it may do is not a disclosure. Only
-- an owner writes it, which is enforced in the API and again here.
DROP POLICY IF EXISTS "role_permissions_isolation" ON "role_permissions";--> statement-breakpoint
CREATE POLICY "role_permissions_isolation" ON "role_permissions" FOR ALL TO altier_app
  USING (altier_is_super_admin() OR (organization_id = altier_org() AND NOT altier_is_tenant()))
  WITH CHECK (altier_is_super_admin() OR (organization_id = altier_org() AND altier_role() = 'owner'));--> statement-breakpoint
