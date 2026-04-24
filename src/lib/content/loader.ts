import { getCollection, type CollectionEntry } from "astro:content";
import { eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { postsMeta, type PostMeta } from "~/lib/db/schema";

export interface PostWithMeta {
  readonly entry: CollectionEntry<"posts">;
  readonly meta: PostMeta;
}

export function defaultMetaFor(slug: string): PostMeta {
  return {
    slug,
    order: Number.MAX_SAFE_INTEGER,
    pinned: false,
    hiddenFromList: true,
    updatedAt: new Date(0),
  };
}

export function sortWithMeta(posts: readonly PostWithMeta[]): readonly PostWithMeta[] {
  return [...posts].sort((a, b) => {
    if (a.meta.pinned !== b.meta.pinned) return a.meta.pinned ? -1 : 1;
    return a.meta.order - b.meta.order;
  });
}

/**
 * Reads Astro's content collection, loads all posts_meta rows, merges them,
 * filters out drafts + hidden posts, and returns a sorted immutable list.
 *
 * Posts without a posts_meta row appear as hidden-by-default (defaultMetaFor)
 * to keep their behavior predictable — the backfill script should be run
 * whenever new files appear in src/content/posts/.
 */
export async function getOrderedPosts(): Promise<readonly PostWithMeta[]> {
  const entries = await getCollection(
    "posts",
    (entry: CollectionEntry<"posts">) => !entry.data.draft,
  );
  const metaRows = await db.select().from(postsMeta);
  const metaBySlug = new Map(metaRows.map((m) => [m.slug, m]));

  const merged: PostWithMeta[] = entries.map((entry: CollectionEntry<"posts">) => ({
    entry,
    meta: metaBySlug.get(entry.id) ?? defaultMetaFor(entry.id),
  }));

  return sortWithMeta(merged.filter((p) => !p.meta.hiddenFromList));
}

export async function getPostWithMeta(slug: string): Promise<PostWithMeta | null> {
  const entries = await getCollection(
    "posts",
    (entry: CollectionEntry<"posts">) => entry.id === slug,
  );
  const entry = entries[0];
  if (!entry) return null;
  const rows = await db.select().from(postsMeta).where(eq(postsMeta.slug, slug));
  const meta = rows[0] ?? defaultMetaFor(slug);
  return { entry, meta };
}
