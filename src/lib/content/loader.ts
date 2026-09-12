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

/**
 * Meta for a slug that doesn't have a `posts_meta` row yet.
 * Used at runtime when the DB IS reachable but a backfill hasn't happened —
 * the post should stay hidden until an admin adds it to the curated list.
 */
export const defaultMetaFor = (slug: string): PostMeta => ({
  slug,
  order: Number.MAX_SAFE_INTEGER,
  pinned: false,
  hiddenFromList: true,
  searchVector: null,
  updatedAt: new Date(0),
});

/**
 * Meta for a slug when the DB is UNREACHABLE (e.g. during `docker build`,
 * which prerenders pages without a Postgres service available). Falls back
 * to the slug's natural numeric prefix (`01-foo` → 1) so the build output
 * still ships with sensible ordering and ALL non-draft posts are visible.
 *
 * Slugs without a `NN-` prefix sort last (alphabetically would also be
 * fine, but consistent with `defaultMetaFor`).
 */
const fallbackMetaForBuild = (slug: string): PostMeta => {
  const m = slug.match(/^(\d{2})[-_]/);
  const order = m ? parseInt(m[1] as string, 10) : Number.MAX_SAFE_INTEGER;
  return {
    slug,
    order,
    pinned: false,
    hiddenFromList: false,
    searchVector: null,
    updatedAt: new Date(0),
  };
};

/** Public lists are newest first; editorial order and pins do not override publication dates. */
export const sortWithMeta = (posts: readonly PostWithMeta[]): readonly PostWithMeta[] =>
  [...posts].sort((a, b) => {
    const byDate = b.entry.data.pubDate.getTime() - a.entry.data.pubDate.getTime();
    return byDate || a.entry.id.localeCompare(b.entry.id, "en");
  });

const matchesLocale = (id: string, locale: Locale): boolean =>
  locale === "en" ? id.startsWith("en/") : !id.startsWith("en/");

const isDbReachable = (): boolean => Boolean(process.env.DATABASE_URL);

/**
 * Loads `posts_meta` rows from the DB. Returns null if the DB is unreachable
 * (e.g. during docker build prerendering). Callers fall back to
 * `fallbackMetaForBuild` when null.
 */
const tryLoadMeta = async (): Promise<Map<string, PostMeta> | null> => {
  if (!isDbReachable()) return null;
  try {
    const rows = await db.select().from(postsMeta);
    return new Map(rows.map((m) => [m.slug, m]));
  } catch {
    return null;
  }
};

/**
 * Reads Astro's content collection, loads all posts_meta rows, merges them,
 * filters out drafts + hidden posts, and returns a sorted immutable list.
 *
 * Pass `{ locale: "en" }` to get only EN posts (those whose collection id
 * starts with "en/"). Defaults to "ru" for back-compat.
 *
 * Two failure modes for meta lookup:
 * - DB unreachable (no DATABASE_URL or connection error) → every post gets
 *   `fallbackMetaForBuild` so the build still produces a usable site.
 * - DB reachable but slug has no row → `defaultMetaFor` (hidden by default;
 *   admin must add the post via /admin/posts to publish it).
 */
export const getOrderedPosts = async (
  options: PostQueryOptions = {},
): Promise<readonly PostWithMeta[]> => {
  const locale = options.locale ?? "ru";

  const entries = await getCollection(
    "posts",
    (entry: CollectionEntry<"posts">) => !entry.data.draft && matchesLocale(entry.id, locale),
  );

  const metaBySlug = await tryLoadMeta();

  const merged: PostWithMeta[] = entries.map((entry: CollectionEntry<"posts">) => {
    // Strip "en/" prefix so EN entries resolve to the same meta row as their
    // RU counterparts (posts_meta is keyed by the RU slug).
    // INVARIANT: EN posts live under exactly src/content/posts/en/<slug>.md (single-level).
    // If we ever nest EN posts deeper, this strip pattern will produce wrong meta keys silently.
    const metaKey = entry.id.replace(/^en\//, "");
    const meta =
      metaBySlug === null
        ? fallbackMetaForBuild(metaKey)
        : (metaBySlug.get(metaKey) ?? defaultMetaFor(metaKey));
    return { entry, meta };
  });

  return sortWithMeta(merged.filter((p) => !p.meta.hiddenFromList));
};

/**
 * Returns a single post merged with its meta row, or null if not found.
 *
 * `slug` is always the RU (un-prefixed) slug. Pass `{ locale: "en" }` to
 * resolve the EN variant (`en/<slug>`).
 *
 * Same DB-fallback semantics as `getOrderedPosts`.
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

  if (!isDbReachable()) {
    return { entry, meta: fallbackMetaForBuild(slug) };
  }

  try {
    const rows = await db.select().from(postsMeta).where(eq(postsMeta.slug, slug));
    const meta = rows[0] ?? defaultMetaFor(slug);
    return { entry, meta };
  } catch {
    return { entry, meta: fallbackMetaForBuild(slug) };
  }
};
