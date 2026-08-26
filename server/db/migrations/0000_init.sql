CREATE TYPE "public"."booking_source" AS ENUM('direct', 'airbnb', 'booking_com', 'agency', 'corporate');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('upcoming', 'in_progress', 'completed', 'cancelled', 'pending');--> statement-breakpoint
CREATE TYPE "public"."charge_type" AS ENUM('rent', 'advance', 'booking', 'deposit', 'utilities', 'service_fee', 'late_fee', 'maintenance_recharge');--> statement-breakpoint
CREATE TYPE "public"."client_kind" AS ENUM('tenant', 'guest', 'corporate', 'owner');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'past', 'prospect');--> statement-breakpoint
CREATE TYPE "public"."comm_channel" AS ENUM('email', 'call', 'sms', 'note', 'portal');--> statement-breakpoint
CREATE TYPE "public"."comm_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."document_category" AS ENUM('lease', 'title', 'insurance', 'inspection', 'compliance', 'invoice', 'id');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('paid', 'pending', 'overdue', 'upcoming', 'partial');--> statement-breakpoint
CREATE TYPE "public"."maintenance_category" AS ENUM('plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'cleaning', 'safety', 'grounds');--> statement-breakpoint
CREATE TYPE "public"."maintenance_priority" AS ENUM('urgent', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('reported', 'scheduled', 'in_progress', 'awaiting_parts', 'completed');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'card', 'mobile_money', 'cash');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('available', 'occupied', 'reserved', 'maintenance', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('apartment', 'house', 'villa', 'serviced', 'short_stay', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'manager', 'staff', 'accountant');--> statement-breakpoint
CREATE TYPE "public"."tenancy_mode" AS ENUM('long_term', 'rental', 'short_stay');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"property_id" text NOT NULL,
	"client_id" text NOT NULL,
	"mode" "tenancy_mode" NOT NULL,
	"status" "booking_status" NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"rate" bigint NOT NULL,
	"deposit" bigint NOT NULL,
	"advance_months" integer DEFAULT 0 NOT NULL,
	"paid_through" date,
	"notice_days" integer DEFAULT 0 NOT NULL,
	"guests" integer NOT NULL,
	"source" "booking_source" NOT NULL,
	"check_in" time NOT NULL,
	"check_out" time NOT NULL,
	"notes" text NOT NULL,
	"created_at" date NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference"),
	CONSTRAINT "bookings_range_valid" CHECK ("bookings"."ends_on" IS NULL OR "bookings"."ends_on" > "bookings"."starts_on"),
	CONSTRAINT "bookings_open_ended_is_rental" CHECK ("bookings"."ends_on" IS NOT NULL OR "bookings"."mode" = 'rental')
);
--> statement-breakpoint
CREATE TABLE "client_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"category" "document_category" NOT NULL,
	"size_kb" integer NOT NULL,
	"uploaded_at" date NOT NULL,
	"uploaded_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_properties" (
	"client_id" text NOT NULL,
	"property_id" text NOT NULL,
	CONSTRAINT "client_properties_client_id_property_id_pk" PRIMARY KEY("client_id","property_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "client_kind" NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"nationality" text NOT NULL,
	"since" date NOT NULL,
	"status" "client_status" NOT NULL,
	"notes" text NOT NULL,
	"emergency_contact" text NOT NULL,
	"lifetime_value" bigint NOT NULL,
	"rating" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"channel" "comm_channel" NOT NULL,
	"direction" "comm_direction" NOT NULL,
	"subject" text NOT NULL,
	"preview" text NOT NULL,
	"at" date NOT NULL,
	"author" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"property_id" text NOT NULL,
	"client_id" text NOT NULL,
	"booking_id" text,
	"type" charge_type NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date NOT NULL,
	"amount" bigint NOT NULL,
	"earns_from" date NOT NULL,
	"earns_to" date NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"status" "invoice_status" NOT NULL,
	"method" "payment_method",
	"paid_on" date,
	"memo" text NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_earns_valid" CHECK ("invoices"."earns_to" > "invoices"."earns_from"),
	CONSTRAINT "invoices_amount_positive" CHECK ("invoices"."amount" >= 0),
	CONSTRAINT "invoices_paid_within_amount" CHECK ("invoices"."paid_amount" >= 0 AND "invoices"."paid_amount" <= "invoices"."amount"),
	CONSTRAINT "invoices_paid_consistent" CHECK (("invoices"."paid_on" IS NULL) = ("invoices"."paid_amount" = 0))
);
--> statement-breakpoint
CREATE TABLE "maintenance_events" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"position" integer NOT NULL,
	"at" date NOT NULL,
	"label" text NOT NULL,
	"by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"property_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" "maintenance_category" NOT NULL,
	"priority" "maintenance_priority" NOT NULL,
	"status" "maintenance_status" NOT NULL,
	"vendor" text NOT NULL,
	"trade" text NOT NULL,
	"assignee_id" text NOT NULL,
	"reported_by" text NOT NULL,
	"reported_on" date NOT NULL,
	"due_on" date NOT NULL,
	"completed_on" date,
	"estimated_cost" bigint NOT NULL,
	"actual_cost" bigint,
	CONSTRAINT "maintenance_requests_reference_unique" UNIQUE("reference"),
	CONSTRAINT "maintenance_completed_consistent" CHECK (("maintenance_requests"."status" = 'completed') = ("maintenance_requests"."completed_on" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "occupancy_spells" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"client_name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"mode" "tenancy_mode" NOT NULL,
	"revenue" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "property_type" NOT NULL,
	"mode" "tenancy_mode" NOT NULL,
	"status" "property_status" NOT NULL,
	"address_line1" text NOT NULL,
	"district" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"map_x" real NOT NULL,
	"map_y" real NOT NULL,
	"bedrooms" integer NOT NULL,
	"bathrooms" integer NOT NULL,
	"size_sqm" integer NOT NULL,
	"price" bigint NOT NULL,
	"manager_id" text NOT NULL,
	"rating" real NOT NULL,
	"available_from" date,
	"acquired_on" date NOT NULL,
	"yield_pct" real NOT NULL,
	"notes" text NOT NULL,
	"photo_seed" integer NOT NULL,
	CONSTRAINT "properties_code_unique" UNIQUE("code"),
	CONSTRAINT "properties_price_positive" CHECK ("properties"."price" >= 0),
	CONSTRAINT "properties_rating_range" CHECK ("properties"."rating" >= 0 AND "properties"."rating" <= 5)
);
--> statement-breakpoint
CREATE TABLE "property_amenities" (
	"property_id" text NOT NULL,
	"amenity" text NOT NULL,
	CONSTRAINT "property_amenities_property_id_amenity_pk" PRIMARY KEY("property_id","amenity")
);
--> statement-breakpoint
CREATE TABLE "property_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"name" text NOT NULL,
	"category" "document_category" NOT NULL,
	"size_kb" integer NOT NULL,
	"uploaded_at" date NOT NULL,
	"uploaded_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_maintenance_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"position" integer NOT NULL,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"rent_due_lead_days" integer NOT NULL,
	"lease_expiry_lead_days" integer NOT NULL,
	"check_in_lead_hours" integer NOT NULL,
	"vacancy_alert_days" integer NOT NULL,
	"maintenance_lead_days" integer NOT NULL,
	"channels" jsonb NOT NULL,
	"quiet_hours_enabled" boolean NOT NULL,
	"quiet_hours_from" time NOT NULL,
	"quiet_hours_to" time NOT NULL,
	"digest" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_settings_single_row" CHECK ("reminder_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"title" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"since" date NOT NULL,
	CONSTRAINT "team_members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_properties" ADD CONSTRAINT "client_properties_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_properties" ADD CONSTRAINT "client_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_request_id_maintenance_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."maintenance_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_assignee_id_team_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occupancy_spells" ADD CONSTRAINT "occupancy_spells_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_manager_id_team_members_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_maintenance_notes" ADD CONSTRAINT "property_maintenance_notes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_property_idx" ON "bookings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "bookings_client_idx" ON "bookings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bookings_range_idx" ON "bookings" USING btree ("starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "client_documents_client_idx" ON "client_documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clients_kind_idx" ON "clients" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "communications_client_at_idx" ON "communications" USING btree ("client_id","at");--> statement-breakpoint
CREATE INDEX "invoices_property_idx" ON "invoices" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "invoices_client_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_due_idx" ON "invoices" USING btree ("due_on");--> statement-breakpoint
CREATE INDEX "invoices_paid_on_idx" ON "invoices" USING btree ("paid_on");--> statement-breakpoint
CREATE INDEX "invoices_earns_idx" ON "invoices" USING btree ("earns_from","earns_to");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_events_order_idx" ON "maintenance_events" USING btree ("request_id","position");--> statement-breakpoint
CREATE INDEX "maintenance_property_idx" ON "maintenance_requests" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "maintenance_status_idx" ON "maintenance_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "maintenance_due_idx" ON "maintenance_requests" USING btree ("due_on");--> statement-breakpoint
CREATE INDEX "occupancy_property_idx" ON "occupancy_spells" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "properties_status_idx" ON "properties" USING btree ("status");--> statement-breakpoint
CREATE INDEX "properties_mode_idx" ON "properties" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "properties_manager_idx" ON "properties" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "property_documents_property_idx" ON "property_documents" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_notes_order_idx" ON "property_maintenance_notes" USING btree ("property_id","position");