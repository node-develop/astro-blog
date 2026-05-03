/**
 * Static OG-image route: emits /og/<slug>.png at build time for every post.
 *
 * Drop at: src/pages/og/[slug].png.ts
 *
 * The locale variants share slugs (RU and EN have separate posts under
 * the same slug name). This route resolves locale by checking which
 * locale has the post; if both have it, RU wins (default site lang).
 * Adjust if you'd rather emit `/og/<slug>.<locale>.png`.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { renderOg } from "~/lib/og/og-image";
import { getOrderedPosts } from "~/lib/content/loader";

const bareSlug = (id: string): string => id.replace(/^en\//, "");

export const getStaticPaths: GetStaticPaths = async () => {
  const ru = await getOrderedPosts({ locale: "ru" });
  const en = await getOrderedPosts({ locale: "en" });

  const seen = new Set<string>();
  const paths: Array<{ params: { slug: string }; props: { title: string; eyebrow?: string } }> = [];

  for (const list of [ru, en]) {
    for (const p of list) {
      const slug = bareSlug(p.entry.id);
      if (seen.has(slug)) continue;
      seen.add(slug);
      const tags = (p.entry.data.tags as string[] | undefined) ?? [];
      const year = p.entry.data.pubDate.getFullYear();
      const eyebrow = tags[0] ? `${tags[0].toUpperCase()} · ${year}` : `ARTKA.DEV · ${year}`;
      paths.push({
        params: { slug },
        props: { title: p.entry.data.title, eyebrow },
      });
    }
  }
  return paths;
};

export const GET: APIRoute = async ({ props }) => {
  const { title, eyebrow } = props as { title: string; eyebrow?: string };
  const png = await renderOg(eyebrow ? { title, eyebrow } : { title });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
