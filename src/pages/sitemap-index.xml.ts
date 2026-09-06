/**
 * sitemap-index — points to per-locale sitemaps.
 *
 * Each child carries <lastmod> = newest lastmod inside that sitemap so
 * crawlers can skip an unchanged locale.
 */
import type { APIRoute } from "astro";
import { loadLocaleSitemaps, renderSitemapIndex } from "~/lib/seo/sitemap";
import { canonicalUrl } from "~/lib/seo/url-policy";

export const GET: APIRoute = async () => {
  const sitemaps = await loadLocaleSitemaps();
  const xml = renderSitemapIndex([
    { loc: canonicalUrl("/sitemap-ru.xml"), entries: sitemaps.ru },
    { loc: canonicalUrl("/sitemap-en.xml"), entries: sitemaps.en },
  ]);
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
