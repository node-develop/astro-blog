/**
 * Per-page OG images for landing routes (SEO-23). One PNG per
 * (page × locale) pair, generated at build time via the same
 * Satori + resvg pipeline as per-post OG.
 *
 * Slug shape: `<page>-<locale>` (e.g. "blog-ru", "course-ccg-en").
 *
 * C-1: allLandingMeta() is now async (reads home.md via getEntry).
 * getStaticPaths supports async, so this is safe.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { renderOg } from "~/lib/og/og-image";
import { allLandingMeta } from "~/lib/og/landing-pages";

export const getStaticPaths: GetStaticPaths = async () => {
  const metas = await allLandingMeta();
  return metas.map((m) => ({
    params: { slug: `${m.page}-${m.locale}` },
    props: { title: m.title, eyebrow: m.eyebrow },
  }));
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
