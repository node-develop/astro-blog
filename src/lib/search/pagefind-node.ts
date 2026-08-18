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
 * The raw `hit.slug` from the DB may carry an `en/` prefix for EN posts; we
 * strip it before building the URL so the path is always bare.
 */
export const searchNode = async (
  query: string,
  locale: Locale = "ru",
): Promise<readonly NodeSearchHit[]> => {
  if (query.trim().length === 0) return [];
  const hits = await searchPostsMeta(query, 20);
  if (hits.length === 0) return [];
  const posts: readonly CollectionEntry<"posts">[] = await getCollection(
    "posts",
    (entry: CollectionEntry<"posts">) => !entry.data.draft,
  );
  const bySlug = new Map<string, CollectionEntry<"posts">>(posts.map((p) => [p.id, p]));
  const blogPrefix = locale === "en" ? "/en/blog" : "/blog";
  const enriched: NodeSearchHit[] = [];
  for (const hit of hits) {
    const post = bySlug.get(hit.slug);
    if (!post) continue;
    // Strip locale prefix from slug (e.g. "en/my-post" → "my-post") so the
    // URL is always /<locale>/blog/<bare-slug> with no double segment.
    const bareSlug = hit.slug.replace(/^en\//, "");
    enriched.push({
      url: canonicalPath(`${blogPrefix}/${bareSlug}`),
      title: post.data.title,
      excerpt: post.data.description ?? "",
    });
  }
  return enriched;
};
