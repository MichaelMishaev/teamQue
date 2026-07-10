CREATE TABLE "queue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"captain_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_captain_id_captains_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."captains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "queue_entries_session_position_idx" ON "queue_entries" USING btree ("session_id","position");