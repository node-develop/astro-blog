import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isTagArchiveIndexable } from "~/lib/seo/indexability";
import { frontmatterOf, underTest } from "../support/snapshot";

const DIST = join(process.cwd(), "dist", "client");

interface SitemapInventory {
  readonly allUrls: readonly string[];
  readonly urlsByFile: ReadonlyMap<string, readonly string[]>;
}

const loadSitemapUrls = (): SitemapInventory | null => {
  if (!existsSync(DIST)) return null;
  const sitemapFiles = readdirSync(DIST).filter((file) => /^sitemap-(ru|en)\.xml$/.test(file));
  if (sitemapFiles.length === 0) return null;
  const urlsByFile = new Map<string, readonly string[]>();
  for (const file of sitemapFiles) {
    const xml = readFileSync(join(DIST, file), "utf8");
    urlsByFile.set(
      file,
      [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] as string),
    );
  }
  return { allUrls: [...urlsByFile.values()].flat(), urlsByFile };
};

describe("sitemap coverage", () => {
  const inventory = loadSitemapUrls();
  if (!inventory)
    throw new Error("dist/client/sitemap-{ru,en}.xml not found — run `pnpm build` first");
  const urls = inventory.allUrls;

  // Astro's sitemap integration emits URLs with a trailing slash for directory routes.
  // Posts come from the snapshot the site was built from, not from astro:content: under vitest
  // the content layer reads whatever data store the last sync wrote.
  it("excludes every current tag archive below two locale posts", () => {
    const byLocale = { ru: new Map<string, number>(), en: new Map<string, number>() };
    for (const article of underTest.snapshot.articles) {
      // The site builds archives from the listed posts only.
      if (article.meta.hiddenFromList) continue;
      const tags = frontmatterOf(article).tags;
      if (!Array.isArray(tags)) continue;
      const counts = byLocale[article.lang];
      for (const tag of tags) counts.set(String(tag), (counts.get(String(tag)) ?? 0) + 1);
    }

    for (const slug of new Set([...byLocale.ru.keys(), ...byLocale.en.keys()])) {
      // The archive's posts are only counted, so a placeholder per post is enough.
      const posts = (n = 0) => Array.from({ length: n });
      if (!isTagArchiveIndexable(posts(byLocale.ru.get(slug))))
        expect(urls).not.toContain(`https://artka.dev/tags/${slug}/`);
      if (!isTagArchiveIndexable(posts(byLocale.en.get(slug))))
        expect(urls).not.toContain(`https://artka.dev/en/tags/${slug}/`);
    }
  });
});
