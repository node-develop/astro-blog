/**
 * Static OG-image route: emits one PNG per post PER LOCALE at build time,
 * at `/og/<slug>-<locale>.png` (see `postOgPath()` for the shape and why
 * both locales carry the suffix).
 *
 * Before this, the route stripped the `en/` prefix and de-duplicated by bare
 * slug with the RU list iterated first, so `/blog/<slug>/` and
 * `/en/blog/<slug>/` pointed at the same file and every EN article was
 * shared with a card in Russian. Nothing failed: the image existed, it was
 * simply the wrong one.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { renderOg } from "~/lib/og/og-image";
import { OG_BRAND_UPPER } from "~/lib/og/brand";
import { bareSlug } from "~/lib/content/slug";
import { postOgSlug } from "~/lib/og/post-pages";

type Post = CollectionEntry<"posts">;

export const getStaticPaths: GetStaticPaths = async () => {
  // Same visibility rule as src/pages/blog/[...slug].astro and its en/ twin:
  // every non-draft post, enumerated through getCollection. The curated
  // getOrderedPosts() drops posts hidden from lists, so using it here left
  // those pages pointing at a card that was never emitted — an og:image 404
  // that no page-level check can see.
  const posts = await getCollection("posts", (entry: Post) => !entry.data.draft);

  const paths: Array<{ params: { slug: string }; props: { title: string; eyebrow: string } }> = [];
  // Fail loud on a name clash instead of letting the later post overwrite the
  // earlier one's card. `<slug>-<locale>` cannot collide today; this guard is
  // what keeps a future change to the shape from reintroducing the silent
  // overwrite that made EN posts render a Russian title.
  const claimedBy = new Map<string, string>();

  for (const post of posts) {
    const locale = post.id.startsWith("en/") ? "en" : "ru";
    const slug = postOgSlug(bareSlug(post.id), locale);

    const clash = claimedBy.get(slug);
    if (clash !== undefined) {
      throw new Error(
        `[og] image path collision at /og/${slug}.png: claimed by both "${clash}" and ` +
          `"${post.id}". Two posts would share one card, so one of them would be shared ` +
          `with the other's title and language. Rename one slug, or change postOgSlug() ` +
          `in src/lib/og/post-pages.ts to a shape that cannot collide.`,
      );
    }
    claimedBy.set(slug, post.id);

    const tags = post.data.tags;
    const year = post.data.pubDate.getFullYear();
    const eyebrow = tags[0] ? `${tags[0].toUpperCase()} · ${year}` : `${OG_BRAND_UPPER} · ${year}`;
    paths.push({ params: { slug }, props: { title: post.data.title, eyebrow } });
  }

  return paths;
};

export const GET: APIRoute = async ({ props }) => {
  const { title, eyebrow } = props as { title: string; eyebrow: string };
  const png = await renderOg({ title, eyebrow });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
