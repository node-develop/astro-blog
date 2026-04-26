ALTER TABLE "posts_meta" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS posts_meta_search_vector_idx ON "posts_meta" USING GIN ("search_vector");
