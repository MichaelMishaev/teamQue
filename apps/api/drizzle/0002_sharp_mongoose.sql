ALTER TYPE "public"."staff_role" ADD VALUE 'visitor';--> statement-breakpoint
DROP INDEX "one_active_session";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "sessions" SET "slug" = substr(md5(random()::text || id::text), 1, 6) WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_slug_unique" ON "sessions" USING btree ("slug");