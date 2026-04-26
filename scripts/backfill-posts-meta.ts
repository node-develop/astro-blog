import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../src/lib/db/index.js";
import { postsMeta } from "../src/lib/db/schema.js";

const POSTS_DIR = resolve(process.cwd(), "src/content/posts");

function parseNumericPrefix(filename: string): number | null {
  const match = /^(\d+)[-_]/.exec(filename);
  if (!match || match[1] === undefined) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

async function main(): Promise<void> {
  const files = await readdir(POSTS_DIR);
  const slugs = files
    .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"))
    .map((f) => f.replace(/\.(md|mdx)$/, ""));

  const existing = await db.select({ slug: postsMeta.slug }).from(postsMeta);
  const existingSet = new Set(existing.map((r) => r.slug));

  const numericSlugs = slugs
    .filter((s) => parseNumericPrefix(s) !== null)
    .sort((a, b) => (parseNumericPrefix(a) ?? 0) - (parseNumericPrefix(b) ?? 0));
  const otherSlugs = slugs.filter((s) => parseNumericPrefix(s) === null).sort();

  const maxNumeric = numericSlugs.length
    ? (parseNumericPrefix(numericSlugs[numericSlugs.length - 1]!) ?? 0)
    : 0;

  const rows: { slug: string; order: number }[] = [];
  for (const slug of numericSlugs) {
    rows.push({ slug, order: parseNumericPrefix(slug)! });
  }
  otherSlugs.forEach((slug, i) => rows.push({ slug, order: maxNumeric + i + 1 }));

  const toInsert = rows.filter((r) => !existingSet.has(r.slug));
  if (toInsert.length === 0) {
    console.warn("nothing to backfill — all slugs already have posts_meta rows");
    return;
  }

  await db.insert(postsMeta).values(toInsert);
  console.warn(`backfilled ${toInsert.length} posts_meta rows:`);
  for (const r of toInsert) console.warn(`  ${r.slug.padEnd(40)} order=${r.order}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
