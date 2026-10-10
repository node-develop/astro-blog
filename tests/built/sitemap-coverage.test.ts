import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

  // Every tag archive and both tag indexes are noindex,follow, so none of them
  // may be listed.
  it("lists no tag archive and no tag index, in either locale", () => {
    const isTagUrl = (url: string): boolean => /^https:\/\/artka\.dev\/(?:en\/)?tags\//.test(url);
    // Positive control: the pattern matches the archives the build really made,
    // so an empty result below means "not listed", not "pattern never matches".
    const builtArchives = ["tags", "en/tags"].flatMap((dir) =>
      readdirSync(join(DIST, dir), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `https://artka.dev/${dir}/${entry.name}/`),
    );
    expect(builtArchives.length).toBeGreaterThan(0);
    expect(builtArchives.every(isTagUrl)).toBe(true);
    expect(urls.filter(isTagUrl)).toEqual([]);
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
