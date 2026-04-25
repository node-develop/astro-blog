import { getCollection, type CollectionEntry } from "astro:content";
import { searchPostsMeta } from "~/lib/db/repo/posts-meta";

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
 */
export async function searchNode(query: string): Promise<readonly NodeSearchHit[]> {
  if (query.trim().length === 0) return [];
  const hits = await searchPostsMeta(query, 20);
  if (hits.length === 0) return [];
  const posts: readonly CollectionEntry<"posts">[] = await getCollection(
    "posts",
    (entry: CollectionEntry<"posts">) => !entry.data.draft,
  );
  const bySlug = new Map<string, CollectionEntry<"posts">>(posts.map((p) => [p.id, p]));
  const enriched: NodeSearchHit[] = [];
  for (const hit of hits) {
    const post = bySlug.get(hit.slug);
    if (!post) continue;
    enriched.push({
      url: `/blog/${hit.slug}`,
      title: post.data.title,
      excerpt: post.data.description ?? "",
    });
  }
  return enriched;
}
