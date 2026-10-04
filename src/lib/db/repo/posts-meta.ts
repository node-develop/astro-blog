import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/lib/db";
import { postsMeta, type PostMeta, type NewPostMeta } from "~/lib/db/schema";
import { buildSearchVectorSql, type SearchVectorParts } from "~/lib/search/vector";

export async function listAllMeta(): Promise<readonly PostMeta[]> {
  return db.select().from(postsMeta).orderBy(asc(postsMeta.order), asc(postsMeta.slug));
}

export async function getMetaBySlug(slug: string): Promise<PostMeta | null> {
  const rows = await db.select().from(postsMeta).where(eq(postsMeta.slug, slug));
  return rows[0] ?? null;
}

export async function listMetaBySlugs(slugs: readonly string[]): Promise<readonly PostMeta[]> {
  if (slugs.length === 0) return [];
  return db
    .select()
    .from(postsMeta)
    .where(inArray(postsMeta.slug, [...slugs]));
}

/** Sets only the flags that are given. Null when there is no row: a row is never created here. */
export async function setMetaFlags(
  slug: string,
  flags: Readonly<{ pinned?: boolean | undefined; hiddenFromList?: boolean | undefined }>,
): Promise<PostMeta | null> {
  const [row] = await db
    .update(postsMeta)
    .set({
      ...(flags.pinned === undefined ? {} : { pinned: flags.pinned }),
      ...(flags.hiddenFromList === undefined ? {} : { hiddenFromList: flags.hiddenFromList }),
      updatedAt: new Date(),
    })
    .where(eq(postsMeta.slug, slug))
    .returning();
  return row ?? null;
}

export async function upsertMeta(row: NewPostMeta): Promise<void> {
  await db
    .insert(postsMeta)
    .values(row)
    .onConflictDoUpdate({
      target: postsMeta.slug,
      set: {
        order: row.order,
        pinned: row.pinned,
        hiddenFromList: row.hiddenFromList,
        updatedAt: new Date(),
      },
    });
}

export async function deleteMeta(slug: string): Promise<void> {
  await db.delete(postsMeta).where(eq(postsMeta.slug, slug));
}

/**
 * Atomically assigns `orders[i]` = i+1 for the slugs in the array order.
 * Skips slugs not present in the table — callers should ensure all slugs
 * exist before invoking.
 */
export async function reorderMeta(slugs: readonly string[]): Promise<void> {
  if (slugs.length === 0) return;
  await db.transaction(async (tx) => {
    for (let i = 0; i < slugs.length; i++) {
      await tx
        .update(postsMeta)
        .set({ order: i + 1, updatedAt: new Date() })
        .where(eq(postsMeta.slug, slugs[i]!));
    }
  });
}

export async function setSearchVector(slug: string, parts: SearchVectorParts): Promise<void> {
  await db
    .update(postsMeta)
    .set({ searchVector: buildSearchVectorSql(parts) as unknown as string })
    .where(eq(postsMeta.slug, slug));
}

export interface SearchHit {
  readonly slug: string;
  readonly rank: number;
}

export async function searchPostsMeta(
  query: string,
  limit = 20,
  lang: "ru" | "en" = "ru",
): Promise<readonly SearchHit[]> {
  if (query.trim().length === 0) return [];
  // TODO(cutover): file posts have no English vector and nothing writes one, so /en falls back to
  // the RU vector; hits without an EN twin are dropped by the caller's collection filter.
  // Removed once EN posts are indexed from the database (docs/superpowers/plans/2026-10-03-api-only-migration.md).
  const vector =
    lang === "en" ? sql`coalesce(search_vector_en, search_vector)` : sql`search_vector`;
  // Bilingual match: OR-combine `simple` (literal/EN) and `russian` (stemmed)
  // tsqueries so a search for "скилл" matches stems "скиллы"/"скиллов",
  // while "CLAUDE.md" still matches as a literal token.
  const rows = await db.execute<{ slug: string; rank: number }>(sql`
    WITH q AS (
      SELECT
        websearch_to_tsquery('simple',  unaccent(${query})) AS q_simple,
        websearch_to_tsquery('russian', unaccent(${query})) AS q_russian
    )
    SELECT slug,
           ts_rank_cd(${vector}, q.q_simple || q.q_russian) AS rank
    FROM posts_meta, q
    WHERE ${vector} @@ (q.q_simple || q.q_russian)
    ORDER BY rank DESC
    LIMIT ${limit}
  `);
  const list = rows as unknown as { slug: string; rank: number }[];
  return list.map((r) => ({ slug: r.slug, rank: Number(r.rank) }));
}

/**
 * Ensures a posts_meta row exists for `slug`. If missing, inserts with
 * order = max + 1 in a single transaction to avoid races. Returns the row.
 */
export async function ensureMeta(slug: string): Promise<PostMeta> {
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(postsMeta).where(eq(postsMeta.slug, slug));
    if (existing[0]) return existing[0];
    const maxRow = await tx.select({ max: sql<number>`coalesce(max("order"), 0)` }).from(postsMeta);
    const max = maxRow[0]?.max ?? 0;
    const [inserted] = await tx
      .insert(postsMeta)
      .values({ slug, order: max + 1, pinned: false, hiddenFromList: false })
      .returning();
    if (!inserted) throw new Error("failed to insert meta");
    return inserted;
  });
}
