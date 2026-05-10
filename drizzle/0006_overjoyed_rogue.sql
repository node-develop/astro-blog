CREATE TYPE "public"."agent_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."post_kind" AS ENUM('post', 'page', 'project');--> statement-breakpoint
CREATE TYPE "public"."post_lang" AS ENUM('ru', 'en');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'published', 'unlisted', 'archived');--> statement-breakpoint
CREATE TABLE "agent_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref_table" text,
	"ref_id" text,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"job_id" uuid,
	"run_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "agent_job_status" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"idempotency_key" text,
	"created_by_id" uuid,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"langgraph_thread_id" text,
	"langsmith_trace_id" text,
	"status" "agent_run_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"model_calls" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"error" jsonb,
	"final_output" jsonb
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"lang" "post_lang" NOT NULL,
	"kind" "post_kind" DEFAULT 'post' NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"summary" text,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"faq" jsonb,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"cover" text,
	"cover_alt" text,
	"author" text DEFAULT 'Артём' NOT NULL,
	"pub_date" timestamp with time zone NOT NULL,
	"updated_date" timestamp with time zone,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body_md" text NOT NULL,
	"body_html" text,
	"toc" jsonb,
	"render_version" integer DEFAULT 0 NOT NULL,
	"rendered_at" timestamp with time zone,
	"source_hash" text,
	"manually_edited" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD CONSTRAINT "agent_artifacts_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_job_id_agent_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."agent_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_artifacts_kind_idx" ON "agent_artifacts" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "agent_artifacts_ref_idx" ON "agent_artifacts" USING btree ("ref_table","ref_id");--> statement-breakpoint
CREATE INDEX "agent_events_created_idx" ON "agent_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_events_job_idx" ON "agent_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "agent_jobs_pending_idx" ON "agent_jobs" USING btree ("priority","run_after","created_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "agent_jobs_kind_idx" ON "agent_jobs" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_jobs_idempotency_ux" ON "agent_jobs" USING btree ("kind","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_job_attempt_ux" ON "agent_runs" USING btree ("job_id","attempt");--> statement-breakpoint
CREATE INDEX "agent_runs_trace_idx" ON "agent_runs" USING btree ("langsmith_trace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slug_lang_ux" ON "posts" USING btree ("slug","lang");--> statement-breakpoint
CREATE INDEX "posts_published_idx" ON "posts" USING btree ("lang","pub_date") WHERE status = 'published';--> statement-breakpoint
CREATE INDEX "posts_search_idx" ON "posts" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "posts_tags_idx" ON "posts" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "posts_kind_status_idx" ON "posts" USING btree ("kind","status","lang");