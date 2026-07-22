ALTER TABLE "activity_log" ADD COLUMN "event_kind" text DEFAULT 'action' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "outcome" text DEFAULT 'success' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "status_code" integer;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "request_method" text;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "request_path" text;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
CREATE INDEX "activity_log_center_created_idx" ON "activity_log" USING btree ("center_id","created_at","id");--> statement-breakpoint
CREATE INDEX "activity_log_center_kind_created_idx" ON "activity_log" USING btree ("center_id","event_kind","created_at");--> statement-breakpoint
CREATE INDEX "activity_log_center_action_created_idx" ON "activity_log" USING btree ("center_id","action","created_at");--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_event_kind_check" CHECK ("activity_log"."event_kind" IN ('action', 'exception'));--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_outcome_check" CHECK ("activity_log"."outcome" IN ('success', 'rejected', 'failed'));--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_kind_outcome_check" CHECK (("activity_log"."event_kind" = 'action' AND "activity_log"."outcome" = 'success') OR ("activity_log"."event_kind" = 'exception' AND "activity_log"."outcome" IN ('rejected', 'failed')));