CREATE TYPE "public"."end_reason" AS ENUM('auto', 'manual', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('queued', 'live', 'paused', 'finished', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('manager', 'staff');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"session_id" uuid,
	"staff_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "captains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"name" text NOT NULL,
	"nickname" text,
	"note" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"pin_hash" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"field_id" uuid,
	"captain_a_id" uuid NOT NULL,
	"captain_b_id" uuid NOT NULL,
	"status" "match_status" NOT NULL,
	"queue_position" integer,
	"planned_duration_sec" integer NOT NULL,
	"started_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"accumulated_pause_sec" integer DEFAULT 0 NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" "end_reason",
	"started_by" uuid,
	"ended_by" uuid,
	CONSTRAINT "captain_a_ne_captain_b" CHECK ("matches"."captain_a_id" <> "matches"."captain_b_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"date" date NOT NULL,
	"location" text,
	"match_duration_sec" integer NOT NULL,
	"status" "session_status" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"pin_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captains" ADD CONSTRAINT "captains_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_captain_a_id_captains_id_fk" FOREIGN KEY ("captain_a_id") REFERENCES "public"."captains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_captain_b_id_captains_id_fk" FOREIGN KEY ("captain_b_id") REFERENCES "public"."captains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_started_by_staff_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_ended_by_staff_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_live_match_per_field" ON "matches" USING btree ("field_id") WHERE "matches"."status" IN ('live','paused');--> statement-breakpoint
CREATE INDEX "matches_session_status_idx" ON "matches" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "matches_session_captain_a_idx" ON "matches" USING btree ("session_id","captain_a_id");--> statement-breakpoint
CREATE INDEX "matches_session_captain_b_idx" ON "matches" USING btree ("session_id","captain_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_session" ON "sessions" USING btree ("center_id") WHERE "sessions"."status" = 'active';