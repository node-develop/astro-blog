/**
 * sitemap-index — points to per-locale sitemaps.
 *
 * Drop at: src/pages/sitemap.xml.ts
 *
 * If you previously used `@astrojs/sitemap`, remove that integration
 * (or set `sitemap: false`) so this file owns `/sitemap.xml`.
 */
import type { APIRoute } from "astro";

const SITE = "https://artka.dev";

export const GET: APIRoute = () => {
  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITE}/sitemap-ru.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE}/sitemap-en.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
