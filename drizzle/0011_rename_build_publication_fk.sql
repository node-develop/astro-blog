-- 0008 created this FK under a 64-character generated name; Postgres stored it truncated
-- to 63 characters, so drizzle-kit saw a missing constraint on every introspection.
-- The schema now names it explicitly; rename instead of drop + add to skip revalidation.
ALTER TABLE "content_articles" RENAME CONSTRAINT "content_articles_build_publication_id_content_publications_id_f" TO "content_articles_build_publication_fk";
