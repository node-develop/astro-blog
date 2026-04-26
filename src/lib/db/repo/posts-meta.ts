import { eq, sql } from "drizzle-orm";
import { db } from "~/lib/db";
import { postsMeta, type PostMeta, type NewPostMeta } from "~/lib/db/schema";
import { buildSearchVectorSql, type SearchVectorParts } from "~/lib/search/vector";

export async function listAllMeta(): Promise<readonly PostMeta[]> {
  return db.select().from(postsMeta);
}

export async function getMetaBySlug(slug: string): Promise<PostMeta | null> {
  const rows = await db.select().from(postsMeta).where(eq(postsMeta.slug, slug));
  return rows[0] ?? null;
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

export async function searchPostsMeta(query: string, limit = 20): Promise<readonly SearchHit[]> {
  if (query.trim().length === 0) return [];
  const rows = await db.execute<{ slug: string; rank: number }>(sql`
    SELECT slug,
           ts_rank_cd(search_vector, websearch_to_tsquery('simple', unaccent(${query}))) AS rank
    FROM posts_meta
    WHERE search_vector @@ websearch_to_tsquery('simple', unaccent(${query}))
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
