CREATE TABLE "content_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"window_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "content_api_keys_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "content_api_requests" (
	"key_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"status" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_api_requests_key_id_idempotency_key_pk" PRIMARY KEY("key_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "content_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"lang" text NOT NULL,
	"slug" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"document" jsonb NOT NULL,
	"base_manual_revision_id" integer DEFAULT 0 NOT NULL,
	"base_remote_hash" text,
	"published_content" text,
	"published_version" integer,
	"first_published_at" timestamp with time zone,
	"key_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hash" text NOT NULL,
	"url" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"key_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_assets_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "content_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"base_remote_hash" text,
	"state" text DEFAULT 'queued' NOT NULL,
	"commit_sha" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" jsonb,
	"key_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_api_requests" ADD CONSTRAINT "content_api_requests_key_id_content_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."content_api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_key_id_content_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."content_api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_key_id_content_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."content_api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_article_id_content_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."content_articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_key_id_content_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."content_api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_articles_external_lang_idx" ON "content_articles" USING btree ("external_id","lang");--> statement-breakpoint
CREATE UNIQUE INDEX "content_articles_slug_lang_idx" ON "content_articles" USING btree ("slug","lang");--> statement-breakpoint
CREATE INDEX "content_publications_pending_idx" ON "content_publications" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "content_publications_article_idx" ON "content_publications" USING btree ("article_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_publications_one_active_idx" ON "content_publications" USING btree ("article_id") WHERE "content_publications"."state" in ('queued', 'publishing');
--> statement-breakpoint
-- Admin writes and API enqueueing share a lock. Reject a manual save/restore
-- during an active publication before it reaches the filesystem. Outside that
-- window the revision ID makes stale API updates fail with a conflict.
CREATE FUNCTION content_guard_manual_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(71423091);
  IF EXISTS (
    SELECT 1 FROM content_articles a JOIN content_publications p ON p.article_id = a.id
    WHERE a.slug = NEW.slug AND p.state IN ('queued', 'publishing')
  ) THEN
    RAISE EXCEPTION 'Publication in progress; wait before editing this article' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER content_guard_manual_revision BEFORE INSERT ON post_revisions
FOR EACH ROW EXECUTE FUNCTION content_guard_manual_revision();
