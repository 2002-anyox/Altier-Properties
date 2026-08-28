--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('starter', 'professional', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint

-- 'tenant' is a portal role, not a staff seat. It joins the existing enum
-- so there stays one membership table and therefore one place where
-- access is decided.
--
-- Replaced rather than extended: ALTER TYPE ... ADD VALUE cannot be used
-- by anything in the same transaction that adds it, and the check
-- constraint below names 'tenant'. Building the type afresh keeps this
-- migration one atomic step, which matters more than the extra lines.
ALTER TYPE "public"."role" RENAME TO "role_before_tenants";--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'manager', 'staff', 'accountant', 'tenant');--> statement-breakpoint

CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"country" text DEFAULT 'Uganda' NOT NULL,
	"currency" text DEFAULT 'UGX' NOT NULL,
	"locale" text DEFAULT 'en-UG' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "subscriptions" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"plan" "plan" DEFAULT 'starter' NOT NULL,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"seat_limit" integer,
	"tenants_count_as_seats" boolean DEFAULT false NOT NULL,
	"current_period_start" date,
	"current_period_end" date,
	"trial_ends_at" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"phone" text DEFAULT '' NOT NULL,
	"password_hash" text,
	"password_set_at" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "organization_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"role" "role" NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"since" date NOT NULL,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_tenant_link"
	  CHECK ((role = 'tenant') = (client_id IS NOT NULL))
);--> statement-breakpoint

CREATE TABLE "member_properties" (
	"member_id" text NOT NULL,
	"property_id" text NOT NULL,
	CONSTRAINT "member_properties_member_id_property_id_pk" PRIMARY KEY("member_id","property_id")
);--> statement-breakpoint

CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "role" NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "invitation_properties" (
	"invitation_id" text NOT NULL,
	"property_id" text NOT NULL,
	CONSTRAINT "invitation_properties_invitation_id_property_id_pk" PRIMARY KEY("invitation_id","property_id")
);--> statement-breakpoint

CREATE TABLE "notification_reads" (
	"organization_id" text NOT NULL,
	"member_id" text NOT NULL,
	"notification_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_reads_member_id_notification_id_pk" PRIMARY KEY("member_id","notification_id")
);--> statement-breakpoint
-- ---------------------------------------------------------------
-- Everything that exists today belongs to one workspace
--
-- A database in service already holds one customer's records; they
-- simply had nowhere to say so. This creates that workspace and puts
-- every existing row in it, so an upgrade changes who can see the data
-- rather than what the data is.
--
-- Only when there is something to move. A database being created for the
-- first time has no team and no properties, and giving it a workspace
-- nobody belongs to would leave a phantom customer sitting beside the
-- real one the first owner is about to create.
-- ---------------------------------------------------------------
INSERT INTO "organizations" (id, name, slug)
SELECT 'org-000000000001', 'Altier Properties', 'altier'
WHERE EXISTS (SELECT 1 FROM "team_members")
   OR EXISTS (SELECT 1 FROM "reminder_settings")
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "subscriptions" (organization_id, plan, status, seat_limit)
SELECT 'org-000000000001', 'professional', 'active', 10
WHERE EXISTS (SELECT 1 FROM "organizations" WHERE id = 'org-000000000001')
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- A team member was an identity and a role in one row. Split it: the
-- person becomes a profile, their place in the workspace a membership,
-- and the membership keeps the old id so every manager_id and
-- assignee_id already pointing at it stays correct.
INSERT INTO "profiles" (id, name, email, phone, password_hash, password_set_at,
                        failed_attempts, locked_until)
SELECT 'pr-' || substr(md5(id), 1, 14), name, email, phone, password_hash,
       password_set_at, failed_attempts, locked_until
FROM "team_members";--> statement-breakpoint

INSERT INTO "organization_members" (id, organization_id, profile_id, role, title, status, since)
SELECT id, 'org-000000000001', 'pr-' || substr(md5(id), 1, 14),
       role::text::"public"."role", title, 'active', since
FROM "team_members";--> statement-breakpoint

-- Who works on what, derived from what the database already records: a
-- property names its manager, a job names the person doing it. Managers
-- and staff are held to their assignments from here on, so without this
-- an upgrade would show them an empty portfolio and look like data loss.
-- Owners and accountants get no rows, which is how "the whole workspace"
-- is written.
INSERT INTO "member_properties" (member_id, property_id)
SELECT om.id, p.id
FROM "organization_members" om
JOIN "properties" p ON p.manager_id = om.id
WHERE om.role IN ('manager', 'staff')
UNION
SELECT om.id, m.property_id
FROM "organization_members" om
JOIN "maintenance_requests" m ON m.assignee_id = om.id
WHERE om.role IN ('manager', 'staff')
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Sessions and linked accounts belong to the person, not the membership.
ALTER TABLE "sessions" ADD COLUMN "profile_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "sessions" SET
  profile_id = 'pr-' || substr(md5(member_id), 1, 14),
  organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "member_id";--> statement-breakpoint

ALTER TABLE "identities" ADD COLUMN "profile_id" text;--> statement-breakpoint
UPDATE "identities" SET profile_id = 'pr-' || substr(md5(member_id), 1, 14);--> statement-breakpoint
ALTER TABLE "identities" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "identities" DROP COLUMN "member_id";--> statement-breakpoint

-- Properties and jobs point at a membership now, not a bare person. The
-- membership kept the old id, so the values are already right; only the
-- constraint has to be re-aimed.
ALTER TABLE "properties" DROP CONSTRAINT IF EXISTS "properties_manager_id_team_members_id_fk";--> statement-breakpoint
ALTER TABLE "maintenance_requests" DROP CONSTRAINT IF EXISTS "maintenance_requests_assignee_id_team_members_id_fk";--> statement-breakpoint
DROP TABLE "team_members";--> statement-breakpoint
-- Nothing refers to the old type once its one table is gone.
DROP TYPE "public"."role_before_tenants";--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_manager_id_fk"
  FOREIGN KEY ("manager_id") REFERENCES "public"."organization_members"("id");--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_assignee_id_fk"
  FOREIGN KEY ("assignee_id") REFERENCES "public"."organization_members"("id");--> statement-breakpoint
-- ---------------------------------------------------------------
-- organization_id on every business table
--
-- Not a convention: the policies in the next migration read this column
-- and nothing else, so a table without it would be a table without
-- isolation.
-- ---------------------------------------------------------------
ALTER TABLE "properties" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "properties" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "clients" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "bookings" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "invoices" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "maintenance_requests" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "maintenance_requests" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "communications" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "communications" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "occupancy_spells" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "occupancy_spells" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "occupancy_spells" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "client_documents" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "client_documents" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "client_documents" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "property_documents" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "property_documents" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "property_documents" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "property_maintenance_notes" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "property_maintenance_notes" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "property_maintenance_notes" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "maintenance_events" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "maintenance_events" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "property_amenities" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "property_amenities" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "property_amenities" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "client_properties" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "client_properties" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "client_properties" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
-- Reminder timing is a customer's preference, not the platform's.
ALTER TABLE "reminder_settings" ADD COLUMN "organization_id" text;--> statement-breakpoint
-- One row per workspace now, rather than the single row the whole
-- installation shared. Whatever is here belongs to the workspace the
-- block above created; on a database being built for the first time
-- there is nothing here at all.
UPDATE "reminder_settings" SET organization_id = 'org-000000000001';--> statement-breakpoint
ALTER TABLE "reminder_settings" DROP CONSTRAINT IF EXISTS "reminder_settings_single_row";--> statement-breakpoint
ALTER TABLE "reminder_settings" DROP CONSTRAINT IF EXISTS "reminder_settings_pkey";--> statement-breakpoint
ALTER TABLE "reminder_settings" DROP COLUMN IF EXISTS "id";--> statement-breakpoint
ALTER TABLE "reminder_settings" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_settings" ADD PRIMARY KEY ("organization_id");--> statement-breakpoint

-- ---------------------------------------------------------------
-- Keys
-- ---------------------------------------------------------------
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_profile_id_fk"
  FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "member_properties" ADD CONSTRAINT "member_properties_member_id_fk"
  FOREIGN KEY ("member_id") REFERENCES "public"."organization_members"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_fk"
  FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "invitation_properties" ADD CONSTRAINT "invitation_properties_invitation_id_fk"
  FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_member_id_fk"
  FOREIGN KEY ("member_id") REFERENCES "public"."organization_members"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_profile_id_fk"
  FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_profile_id_fk"
  FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade;--> statement-breakpoint

CREATE INDEX "profiles_email_idx" ON "profiles" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_unique" ON "organization_members" ("organization_id","profile_id");--> statement-breakpoint
CREATE INDEX "organization_members_profile_idx" ON "organization_members" ("profile_id");--> statement-breakpoint
CREATE INDEX "organization_members_org_idx" ON "organization_members" ("organization_id");--> statement-breakpoint
CREATE INDEX "member_properties_property_idx" ON "member_properties" ("property_id");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" ("email");--> statement-breakpoint
CREATE INDEX "notification_reads_org_idx" ON "notification_reads" ("organization_id");--> statement-breakpoint
CREATE INDEX "sessions_profile_idx" ON "sessions" ("profile_id");--> statement-breakpoint
CREATE INDEX "identities_profile_idx" ON "identities" ("profile_id");--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "properties_org_idx" ON "properties" ("organization_id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "clients_org_idx" ON "clients" ("organization_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "bookings_org_idx" ON "bookings" ("organization_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "invoices_org_idx" ON "invoices" ("organization_id");--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "maintenance_requests_org_idx" ON "maintenance_requests" ("organization_id");--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "communications_org_idx" ON "communications" ("organization_id");--> statement-breakpoint
ALTER TABLE "occupancy_spells" ADD CONSTRAINT "occupancy_spells_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "occupancy_spells_org_idx" ON "occupancy_spells" ("organization_id");--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "client_documents_org_idx" ON "client_documents" ("organization_id");--> statement-breakpoint
ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "property_documents_org_idx" ON "property_documents" ("organization_id");--> statement-breakpoint
ALTER TABLE "property_maintenance_notes" ADD CONSTRAINT "property_maintenance_notes_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "property_maintenance_notes_org_idx" ON "property_maintenance_notes" ("organization_id");--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "maintenance_events_org_idx" ON "maintenance_events" ("organization_id");--> statement-breakpoint
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "property_amenities_org_idx" ON "property_amenities" ("organization_id");--> statement-breakpoint
ALTER TABLE "client_properties" ADD CONSTRAINT "client_properties_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "client_properties_org_idx" ON "client_properties" ("organization_id");--> statement-breakpoint
ALTER TABLE "reminder_settings" ADD CONSTRAINT "reminder_settings_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;--> statement-breakpoint
