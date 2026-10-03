CREATE TABLE "content_article_versions" (
	"article_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"document" jsonb NOT NULL,
	"actor_key_id" uuid,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_article_versions_article_id_version_pk" PRIMARY KEY("article_id","version")
);
--> statement-breakpoint
ALTER TABLE "content_articles" ADD COLUMN "build_publication_id" uuid;--> statement-breakpoint
ALTER TABLE "content_articles" ADD COLUMN "last_modified_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "content_articles" ADD COLUMN "source_version" integer;--> statement-breakpoint
ALTER TABLE "content_articles" ADD COLUMN "unpublished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_articles" ADD COLUMN "manually_edited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "content_publications" ADD COLUMN "kind" text DEFAULT 'publish' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_publications" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "content_publications" ADD COLUMN "dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_publications" ADD COLUMN "hooks_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_article_versions" ADD CONSTRAINT "content_article_versions_article_id_content_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."content_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_article_versions" ADD CONSTRAINT "content_article_versions_actor_key_id_content_api_keys_id_fk" FOREIGN KEY ("actor_key_id") REFERENCES "public"."content_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_article_versions" ADD CONSTRAINT "content_article_versions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_build_publication_id_content_publications_id_fk" FOREIGN KEY ("build_publication_id") REFERENCES "public"."content_publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_publications_batch_idx" ON "content_publications" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_kind_check" CHECK ("content_publications"."kind" in ('publish', 'unpublish'));
--> statement-breakpoint
-- Data part, hand-written. Everything below is idempotent on an empty database
-- and safe on the production one.
-- last_modified_at starts as the last save, not as the moment of this migration.
UPDATE "content_articles" SET "last_modified_at" = "updated_at";
--> statement-breakpoint
-- System key for admins signed in with a session cookie. The token_hash is not
-- a sha256 hex digest, so no bearer token can ever match it.
INSERT INTO "content_api_keys" ("name", "token_hash", "scopes")
VALUES (
  'admin-session',
  'session:0000000000000000000000000000000000000000000000000000000000000000',
  '["articles:read","articles:write","articles:publish","media:write"]'::jsonb
)
ON CONFLICT ("token_hash") DO NOTHING;
--> statement-breakpoint
-- History starts with the document each article has now, under its current
-- version number (earlier documents were never stored).
INSERT INTO "content_article_versions" ("article_id", "version", "document", "actor_key_id", "created_at")
SELECT "id", "version", "document", "key_id", "updated_at" FROM "content_articles"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- The build pointer of an already published article is its latest verified publication.
UPDATE "content_articles" a SET "build_publication_id" = (
  SELECT p."id" FROM "content_publications" p
  WHERE p."article_id" = a."id" AND p."state" = 'published'
  ORDER BY p."created_at" DESC LIMIT 1
)
WHERE a."published_version" IS NOT NULL;
--> statement-breakpoint
-- Publications finished before hooks existed must not fire IndexNow or social
-- drafts retroactively.
UPDATE "content_publications" SET "hooks_done_at" = "updated_at"
WHERE "state" IN ('published', 'failed');
