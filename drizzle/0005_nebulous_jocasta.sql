CREATE TYPE "public"."social_channel" AS ENUM('x_en', 'li_en', 'tg_ru');--> statement-breakpoint
CREATE TYPE "public"."social_status" AS ENUM('generating', 'pending', 'sending', 'sent', 'failed', 'superseded', 'skipped');--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_collection" text NOT NULL,
	"post_slug" text NOT NULL,
	"channel" "social_channel" NOT NULL,
	"status" "social_status" DEFAULT 'generating' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"thread_tail" jsonb,
	"media_url" text,
	"critic_annotations" jsonb,
	"generation_model" text,
	"editor_model" text,
	"critic_model" text,
	"source_hash" text NOT NULL,
	"external_id" text,
	"external_url" text,
	"sent_at" timestamp with time zone,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"approved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_social_post_slug" ON "social_posts" USING btree ("post_collection","post_slug");--> statement-breakpoint
CREATE INDEX "ix_social_status" ON "social_posts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_social_active_per_channel" ON "social_posts" USING btree ("post_collection","post_slug","channel") WHERE status NOT IN ('superseded', 'skipped', 'failed');