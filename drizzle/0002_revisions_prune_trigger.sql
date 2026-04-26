-- Keep at most 50 revisions per slug. Runs after every insert.
-- Uses a row-number window to identify rows to delete atomically.

CREATE OR REPLACE FUNCTION prune_post_revisions() RETURNS trigger AS $$
BEGIN
  DELETE FROM post_revisions
  WHERE id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at DESC, id DESC) AS rn
      FROM post_revisions
      WHERE slug = NEW.slug
    ) ranked
    WHERE rn > 50
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS post_revisions_prune ON post_revisions;
--> statement-breakpoint
CREATE TRIGGER post_revisions_prune
AFTER INSERT ON post_revisions
FOR EACH ROW
EXECUTE FUNCTION prune_post_revisions();
