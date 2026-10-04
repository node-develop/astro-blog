ALTER TABLE "posts_meta" ADD COLUMN "search_vector_en" "tsvector";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS posts_meta_search_vector_en_idx ON "posts_meta" USING GIN ("search_vector_en");--> statement-breakpoint
-- Until now the worker wrote one vector per slug from whichever language was verified last.
-- A slug with a published English API article and no published Russian one may carry English text
-- in "search_vector". It is cleared, not guessed: run `pnpm db:backfill-search` once after the
-- deploy to rebuild the Russian vector from the Russian file.
UPDATE "posts_meta" SET "search_vector" = NULL
WHERE "slug" IN (SELECT "slug" FROM "content_articles" WHERE "lang" = 'en' AND "published_version" IS NOT NULL)
  AND "slug" NOT IN (SELECT "slug" FROM "content_articles" WHERE "lang" = 'ru' AND "published_version" IS NOT NULL);--> statement-breakpoint
-- Published API articles: each language's column is recomputed from the document that was
-- published (its version row, else the current document), with the expression of buildSearchVectorSql.
UPDATE "posts_meta" AS pm SET "search_vector" = (
  setweight(to_tsvector('simple',  unaccent(d.title)), 'A') ||
  setweight(to_tsvector('russian', unaccent(d.title)), 'A') ||
  setweight(to_tsvector('simple',  unaccent(d.tags)), 'B') ||
  setweight(to_tsvector('russian', unaccent(d.tags)), 'B') ||
  setweight(to_tsvector('simple',  unaccent(d.body)), 'C') ||
  setweight(to_tsvector('russian', unaccent(d.body)), 'C')
)
FROM (
  SELECT a.slug,
         coalesce(doc.document->>'title', '') AS title,
         coalesce(doc.document->>'body', '') AS body,
         coalesce((
           SELECT string_agg(t.tag, ' ' ORDER BY t.ord)
           FROM jsonb_array_elements_text(coalesce(doc.document->'tags', '[]'::jsonb)) WITH ORDINALITY AS t(tag, ord)
         ), '') AS tags
  FROM "content_articles" AS a
  LEFT JOIN "content_article_versions" AS v ON v.article_id = a.id AND v.version = a.published_version
  CROSS JOIN LATERAL (SELECT coalesce(v.document, a.document) AS document) AS doc
  WHERE a.lang = 'ru' AND a.published_version IS NOT NULL
) AS d
WHERE pm.slug = d.slug;--> statement-breakpoint
UPDATE "posts_meta" AS pm SET "search_vector_en" = (
  setweight(to_tsvector('simple',  unaccent(d.title)), 'A') ||
  setweight(to_tsvector('russian', unaccent(d.title)), 'A') ||
  setweight(to_tsvector('simple',  unaccent(d.tags)), 'B') ||
  setweight(to_tsvector('russian', unaccent(d.tags)), 'B') ||
  setweight(to_tsvector('simple',  unaccent(d.body)), 'C') ||
  setweight(to_tsvector('russian', unaccent(d.body)), 'C')
)
FROM (
  SELECT a.slug,
         coalesce(doc.document->>'title', '') AS title,
         coalesce(doc.document->>'body', '') AS body,
         coalesce((
           SELECT string_agg(t.tag, ' ' ORDER BY t.ord)
           FROM jsonb_array_elements_text(coalesce(doc.document->'tags', '[]'::jsonb)) WITH ORDINALITY AS t(tag, ord)
         ), '') AS tags
  FROM "content_articles" AS a
  LEFT JOIN "content_article_versions" AS v ON v.article_id = a.id AND v.version = a.published_version
  CROSS JOIN LATERAL (SELECT coalesce(v.document, a.document) AS document) AS doc
  WHERE a.lang = 'en' AND a.published_version IS NOT NULL
) AS d
WHERE pm.slug = d.slug;
