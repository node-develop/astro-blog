import { getCollection, type CollectionEntry } from "astro:content";
import { searchPostsMeta } from "~/lib/db/repo/posts-meta";
import type { Locale } from "~/i18n";
import { canonicalPath } from "~/lib/seo/url-policy";

export interface NodeSearchHit {
  readonly url: string;
  readonly title: string;
  readonly excerpt: string;
}

/**
 * SSR-side search for `/search.astro`. The browser-targeted Pagefind bundle
 * at `dist/client/pagefind/pagefind.js` cannot run cleanly in Node (it uses
 * `import.meta.url`, `fetch` against relative `/pagefind/` paths, and the
 * browser `WebAssembly.instantiateStreaming` shape). Rather than re-implement
 * a Node binding, we reuse the Postgres FTS index that already powers admin
 * search: the `posts_meta.search_vector` tsvector indexes title/tags/body.
 *
 * Trade-offs vs. the browser Pagefind path:
 *   + Same source of truth as admin search; no separate index drift.
 *   + Works with `astro dev` (no `dist/` required).
 *   + No double-rebuild on content changes.
 *   - Excerpts come from frontmatter `description`, not contextual matches.
 *   - Drafts are excluded (good — public-facing).
 *
 * The interactive ⌘K palette still uses the Pagefind WASM bundle in the
 * browser, so JS-enabled visitors get rich excerpts. `/search` is the no-JS
 * fallback per the plan.
 *
 * `locale` controls which post collection is searched and how the result URL
 * is prefixed: RU posts live at `/blog/<slug>`, EN posts at `/en/blog/<slug>`.
 * `hit.slug` from the DB is always the bare slug (posts_meta is keyed by it,
 * for both languages); the EN collection entry is looked up as `en/<slug>`.
 * For `en` the EN vector is searched, so an English query matches English text.
 */
export const searchNode = async (
  query: string,
  locale: Locale = "ru",
): Promise<readonly NodeSearchHit[]> => {
  if (query.trim().length === 0) return [];
  const hits = await searchPostsMeta(query, 20, locale);
  if (hits.length === 0) return [];
  const posts: readonly CollectionEntry<"posts">[] = await getCollection(
    "posts",
    (entry: CollectionEntry<"posts">) => !entry.data.draft,
  );
  const bySlug = new Map<string, CollectionEntry<"posts">>(posts.map((p) => [p.id, p]));
  const blogPrefix = locale === "en" ? "/en/blog" : "/blog";
  const idPrefix = locale === "en" ? "en/" : "";
  const enriched: NodeSearchHit[] = [];
  for (const hit of hits) {
    // posts_meta is keyed by the bare slug; the EN collection entry is `en/<slug>`.
    const post = bySlug.get(`${idPrefix}${hit.slug}`);
    if (!post) continue;
    enriched.push({
      url: canonicalPath(`${blogPrefix}/${hit.slug}`),
      title: post.data.title,
      excerpt: post.data.description ?? "",
    });
  }
  return enriched;
};
