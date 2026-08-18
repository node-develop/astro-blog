/**
 * sitemap-index — points to per-locale sitemaps.
 *
 * Drop at: src/pages/sitemap.xml.ts
 *
 * If you previously used `@astrojs/sitemap`, remove that integration
 * (or set `sitemap: false`) so this file owns `/sitemap.xml`.
 */
import type { APIRoute } from "astro";
import { canonicalUrl } from "~/lib/seo/url-policy";

export const GET: APIRoute = () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${canonicalUrl("/sitemap-ru.xml")}</loc>
  </sitemap>
  <sitemap>
    <loc>${canonicalUrl("/sitemap-en.xml")}</loc>
  </sitemap>
</sitemapindex>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
