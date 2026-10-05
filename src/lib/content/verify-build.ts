import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExportArticle, ExportSnapshot } from "../content-api/contract";
import { canonicalUrl } from "../seo/url-policy";

const prefixOf = (article: Pick<ExportArticle, "lang">): string =>
  article.lang === "en" ? "/en" : "";

/** The file's text, or null when it does not exist. Any other read error is not a finding: it throws. */
const readIfExists = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const sitemapLocs = (xml: string): ReadonlySet<string> =>
  new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] as string));

/**
 * Compares a finished build (`dist/client`) with the snapshot it was built from. Returns the
 * findings, empty when the build is what the snapshot asked for:
 * - every article has its page, carrying the exported revision in `data-content-revision`;
 * - every listed article is in its locale's sitemap, every `hiddenFromList` one is not.
 */
export const verifyContentBuild = async (
  snapshot: ExportSnapshot,
  distClientDir: string,
): Promise<readonly string[]> => {
  const issues: string[] = [];
  const sitemaps = new Map<ExportArticle["lang"], ReadonlySet<string> | null>();
  for (const lang of ["ru", "en"] as const) {
    const xml = await readIfExists(join(distClientDir, `sitemap-${lang}.xml`));
    sitemaps.set(lang, xml === null ? null : sitemapLocs(xml));
    if (xml === null) issues.push(`sitemap-${lang}.xml is missing`);
  }

  for (const article of snapshot.articles) {
    const where = `${article.slug} (${article.lang})`;
    const path = `${prefixOf(article)}/blog/${article.slug}/`;
    const html = await readIfExists(join(distClientDir, path, "index.html"));
    if (html === null) issues.push(`${where}: ${path}index.html is missing`);
    else if (!html.includes(`data-content-revision="${article.revision}"`))
      issues.push(`${where}: page does not carry data-content-revision="${article.revision}"`);

    const locs = sitemaps.get(article.lang);
    if (!locs) continue;
    const listed = locs.has(canonicalUrl(path));
    if (article.meta.hiddenFromList && listed)
      issues.push(`${where}: hiddenFromList but present in sitemap-${article.lang}.xml`);
    if (!article.meta.hiddenFromList && !listed)
      issues.push(`${where}: missing from sitemap-${article.lang}.xml`);
  }
  return issues;
};
