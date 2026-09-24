import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getOrderedPosts } from "~/lib/content/loader";
import { getAllTagSlugs, groupPostsByTag } from "~/lib/content/tags";
import { isTagArchiveIndexable } from "~/lib/seo/indexability";

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
  it("excludes every current tag archive below two locale posts", async () => {
    const [ru, en] = await Promise.all([
      getOrderedPosts({ locale: "ru" }),
      getOrderedPosts({ locale: "en" }),
    ]);
    const ruGroups = groupPostsByTag(ru);
    const enGroups = groupPostsByTag(en);

    for (const slug of getAllTagSlugs({ ru, en })) {
      if (!isTagArchiveIndexable(ruGroups.get(slug) ?? [])) {
        expect(urls).not.toContain(`https://artka.dev/tags/${slug}/`);
      }
      if (!isTagArchiveIndexable(enGroups.get(slug) ?? [])) {
        expect(urls).not.toContain(`https://artka.dev/en/tags/${slug}/`);
      }
    }
  });

  it("excludes search, login, admin, and API routes", () => {
    expect(urls).not.toContain("https://artka.dev/search/");
    expect(urls).not.toContain("https://artka.dev/en/search/");
    expect(urls).not.toContain("https://artka.dev/login/");
    for (const u of urls!) {
      expect(u).not.toMatch(/\/admin\//);
      expect(u).not.toMatch(/\/api\//);
    }
  });
});
