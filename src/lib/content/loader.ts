import { getCollection, type CollectionEntry } from "astro:content";
import { eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { postsMeta, type PostMeta } from "~/lib/db/schema";
import type { Locale } from "~/i18n";

export interface PostWithMeta {
  readonly entry: CollectionEntry<"posts">;
  readonly meta: PostMeta;
}

export interface PostQueryOptions {
  readonly locale?: Locale;
}

export const defaultMetaFor = (slug: string): PostMeta => ({
  slug,
  order: Number.MAX_SAFE_INTEGER,
  pinned: false,
  hiddenFromList: true,
  searchVector: null,
  updatedAt: new Date(0),
});

export const sortWithMeta = (posts: readonly PostWithMeta[]): readonly PostWithMeta[] =>
  [...posts].sort((a, b) => {
    if (a.meta.pinned !== b.meta.pinned) return a.meta.pinned ? -1 : 1;
    return a.meta.order - b.meta.order;
  });

const matchesLocale = (id: string, locale: Locale): boolean =>
  locale === "en" ? id.startsWith("en/") : !id.startsWith("en/");

/**
 * Reads Astro's content collection, loads all posts_meta rows, merges them,
 * filters out drafts + hidden posts, and returns a sorted immutable list.
 *
 * Pass `{ locale: "en" }` to get only EN posts (those whose collection id
 * starts with "en/"). Defaults to "ru" for back-compat with call sites that
 * pass no argument.
 *
 * Posts without a posts_meta row appear as hidden-by-default (defaultMetaFor)
 * to keep their behavior predictable — the backfill script should be run
 * whenever new files appear in src/content/posts/.
 *
 * EN entries share the same posts_meta row as their RU counterpart: the
 * "en/" prefix is stripped from the id before the meta lookup.
 */
export const getOrderedPosts = async (
  options: PostQueryOptions = {},
): Promise<readonly PostWithMeta[]> => {
  const locale = options.locale ?? "ru";

  const entries = await getCollection(
    "posts",
    (entry: CollectionEntry<"posts">) => !entry.data.draft && matchesLocale(entry.id, locale),
  );

  const metaRows = await db.select().from(postsMeta);
  const metaBySlug = new Map(metaRows.map((m) => [m.slug, m]));

  const merged: PostWithMeta[] = entries.map((entry: CollectionEntry<"posts">) => {
    // Strip "en/" prefix so EN entries resolve to the same meta row as their
    // RU counterparts (posts_meta is keyed by the RU slug).
    // INVARIANT: EN posts live under exactly src/content/posts/en/<slug>.md (single-level).
    // If we ever nest EN posts deeper, this strip pattern will produce wrong meta keys silently.
    const metaKey = entry.id.replace(/^en\//, "");
    return {
      entry,
      meta: metaBySlug.get(metaKey) ?? defaultMetaFor(metaKey),
    };
  });

  return sortWithMeta(merged.filter((p) => !p.meta.hiddenFromList));
};

/**
 * Returns a single post merged with its meta row, or null if not found.
 *
 * `slug` is always the RU (un-prefixed) slug. Pass `{ locale: "en" }` to
 * resolve the EN variant (`en/<slug>`).
 */
export const getPostWithMeta = async (
  slug: string,
  options: PostQueryOptions = {},
): Promise<PostWithMeta | null> => {
  const locale = options.locale ?? "ru";
  const fullId = locale === "en" ? `en/${slug}` : slug;

  const entries = await getCollection(
    "posts",
    (entry: CollectionEntry<"posts">) => entry.id === fullId,
  );
  const entry = entries[0];
  if (!entry) return null;

  const rows = await db.select().from(postsMeta).where(eq(postsMeta.slug, slug));
  const meta = rows[0] ?? defaultMetaFor(slug);
  return { entry, meta };
};
