/**
 * Per-page OG images for landing routes (SEO-23). One PNG per
 * (page × locale) pair, generated at build time via the same
 * Satori + resvg pipeline as per-post OG.
 *
 * Slug shape: `<page>-<locale>` (e.g. "blog-ru", "course-ccg-en").
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { renderOg } from "~/lib/og/og-image";
import { allLandingMeta } from "~/lib/og/landing-pages";
import { t } from "~/i18n";

export const getStaticPaths: GetStaticPaths = () =>
  allLandingMeta().map((m) => ({
    params: { slug: `${m.page}-${m.locale}` },
    props: { title: t(m.locale, m.titleKey), eyebrow: m.eyebrow },
  }));

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
