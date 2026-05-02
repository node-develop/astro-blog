import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const POSTS_DIR = resolve(process.cwd(), "src/content/posts");

const parseNumericPrefix = (filename) => {
  const m = /^(\d+)[-_]/.exec(filename);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
};

const sql = postgres(url, { max: 1 });
try {
  const files = await readdir(POSTS_DIR);
  const slugs = files
    .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"))
    .map((f) => f.replace(/\.(md|mdx)$/, ""));

  const numericSlugs = slugs
    .filter((s) => parseNumericPrefix(s) !== null)
    .sort((a, b) => parseNumericPrefix(a) - parseNumericPrefix(b));
  const otherSlugs = slugs.filter((s) => parseNumericPrefix(s) === null).sort();

  const maxNumeric = numericSlugs.length ? parseNumericPrefix(numericSlugs.at(-1)) : 0;

  const rows = numericSlugs
    .map((slug) => ({ slug, order: parseNumericPrefix(slug) }))
    .concat(otherSlugs.map((slug, i) => ({ slug, order: maxNumeric + i + 1 })));

  if (rows.length === 0) {
    console.log("backfill: no posts found, skipping");
    await sql.end();
    process.exit(0);
  }

  const inserted = await sql`
    INSERT INTO posts_meta ${sql(rows, "slug", "order")}
    ON CONFLICT (slug) DO NOTHING
    RETURNING slug
  `;

  console.log(
    inserted.length === 0
      ? `backfill: ${rows.length} slugs already present, no-op`
      : `backfill: inserted ${inserted.length}/${rows.length} new posts_meta rows`,
  );
} catch (err) {
  console.error("backfill failed", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
