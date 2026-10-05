import { getCollection, type CollectionEntry } from "astro:content";
import { eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { postsMeta, type PostMeta } from "~/lib/db/schema";
import { logger } from "~/lib/logger";
import type { Locale } from "~/i18n";

export interface PostWithMeta {
  readonly entry: CollectionEntry<"posts">;
  readonly meta: PostMeta;
}

export interface PostQueryOptions {
  readonly locale?: Locale;
}

/**
 * Meta for a slug that has no `posts_meta` row, for callers outside the page loader: the Content
 * API export (`content-api/export.ts`, a slug without a row) and the admin posts list. The page
 * loader itself falls back to the snapshot `_meta` instead (see `selectMeta`).
 *
 * VISIBLE by default, mirroring the column default in `posts_meta` (`hidden_from_list` defaults to
 * false) and every write path that creates a row: `ensureMeta` (admin `posts.upsert`) and the
 * content-API worker insert `hiddenFromList: false`. Hiding by default would make a post without a
 * row disappear from the list, the sitemap and llms.txt with no error anywhere: "saved" would look
 * like "published" while no crawler could find it. Hiding a post is an explicit editorial act
 * (`posts.setVisibility` writes `hiddenFromList: true`); drafts are filtered earlier, by the
 * `draft` frontmatter flag. `order` stays last: public lists sort by publication date.
 */
export const defaultMetaFor = (slug: string): PostMeta => ({
  slug,
  order: Number.MAX_SAFE_INTEGER,
  pinned: false,
  hiddenFromList: false,
  searchVector: null,
  searchVectorEn: null,
  updatedAt: new Date(0),
});

/**
 * Meta carried by the snapshot entry itself (`data._meta`). It is what a build without a database
 * serves, and what stands in for a slug whose `posts_meta` row does not exist yet or whose DB
 * lookup failed: the snapshot is the editorial state as of the export.
 */
const snapshotMeta = (entry: CollectionEntry<"posts">, slug: string): PostMeta => ({
  slug,
  order: entry.data._meta.order,
  pinned: entry.data._meta.pinned,
  hiddenFromList: entry.data._meta.hiddenFromList,
  searchVector: null,
  searchVectorEn: null,
  updatedAt: new Date(0),
});

/** The one meta-selection rule: the DB row when there is one, otherwise the snapshot's `_meta`. */
const selectMeta = (
  entry: CollectionEntry<"posts">,
  slug: string,
  row: PostMeta | undefined,
): PostMeta => row ?? snapshotMeta(entry, slug);

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
 * Loads `posts_meta` rows from the DB. Returns null when there is no DATABASE_URL (docker build
 * prerendering) or the query failed (logged). Callers then use the snapshot `_meta`.
 */
const tryLoadMeta = async (): Promise<Map<string, PostMeta> | null> => {
  if (!isDbReachable()) return null;
  try {
    const rows = await db.select().from(postsMeta);
    return new Map(rows.map((m) => [m.slug, m]));
  } catch (err) {
    logger.error({ err }, "posts_meta lookup failed: using the snapshot meta for every post");
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
 * Meta lookup: the `posts_meta` row when the DB is reachable and has one; otherwise the snapshot
 * `_meta` of the entry. No DATABASE_URL (build) uses `_meta` quietly; a DB error is logged
 * (pino error); a missing row is logged (pino warning naming the slugs) so the gap is noticed.
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

  const missingMeta: string[] = [];

  const merged: PostWithMeta[] = entries.map((entry: CollectionEntry<"posts">) => {
    // Strip "en/" prefix so EN entries resolve to the same meta row as their
    // RU counterparts (posts_meta is keyed by the RU slug).
    // INVARIANT: EN entry ids are exactly "en/<slug>" (see entryIdOf in snapshot.ts).
    // If ids ever nest deeper, this strip pattern will produce wrong meta keys silently.
    const metaKey = entry.id.replace(/^en\//, "");
    const row = metaBySlug?.get(metaKey);
    if (metaBySlug && !row) missingMeta.push(metaKey);
    return { entry, meta: selectMeta(entry, metaKey, row) };
  });

  if (missingMeta.length > 0) {
    logger.warn(
      { locale, slugs: missingMeta, count: missingMeta.length },
      "posts_meta rows missing for published posts: the snapshot meta is used meanwhile (no search state). The row is created by the content worker, an import or admin posts.upsert.",
    );
  }

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

  if (!isDbReachable()) return { entry, meta: selectMeta(entry, slug, undefined) };

  try {
    const rows = await db.select().from(postsMeta).where(eq(postsMeta.slug, slug));
    const row = rows[0];
    if (!row) {
      logger.warn(
        { slug, locale },
        "posts_meta row missing for post: the snapshot meta is used meanwhile (no search state). The row is created by the content worker, an import or admin posts.upsert.",
      );
    }
    return { entry, meta: selectMeta(entry, slug, row) };
  } catch (err) {
    logger.error({ err, slug, locale }, "posts_meta lookup failed: using the snapshot meta");
    return { entry, meta: selectMeta(entry, slug, undefined) };
  }
};
