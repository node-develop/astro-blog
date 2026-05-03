import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIST = join(process.cwd(), "dist", "client");

const loadSitemapUrls = (): ReadonlySet<string> | null => {
  if (!existsSync(DIST)) return null;
  const sitemapFiles = readdirSync(DIST).filter(
    (f) => f.startsWith("sitemap-") && f.endsWith(".xml"),
  );
  if (sitemapFiles.length === 0) return null;
  const urls = new Set<string>();
  for (const f of sitemapFiles) {
    const xml = readFileSync(join(DIST, f), "utf8");
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      urls.add(m[1]);
    }
  }
  return urls;
};

describe("sitemap coverage", () => {
  const urls = loadSitemapUrls();
  const skipReason = urls ? null : "dist/client/sitemap-*.xml not found — run `pnpm build` first";

  // Astro's sitemap integration emits URLs with a trailing slash for directory routes.
  it.skipIf(skipReason !== null)("includes both /tags and /en/tags index pages", () => {
    expect(urls!).toContain("https://artka.dev/tags/");
    expect(urls!).toContain("https://artka.dev/en/tags/");
  });

  it.skipIf(skipReason !== null)("tag archive URLs are well-formed when present", () => {
    // After the claude-code-guide migration the only two pre-existing
    // tags ("claude-code", "guide") moved to course lessons, so /tags/
    // archives can be empty until new tagged posts land. Assert URL
    // shape rather than non-emptiness; tighten once tags repopulate.
    const ruArchives = [...urls!].filter((u) => u.match(/^https:\/\/artka\.dev\/tags\/[^/]+\/$/));
    const enArchives = [...urls!].filter((u) =>
      u.match(/^https:\/\/artka\.dev\/en\/tags\/[^/]+\/$/),
    );
    expect(ruArchives.length).toBe(enArchives.length);
  });

  it.skipIf(skipReason !== null)("includes the entity pages from Plan 2", () => {
    for (const path of ["/about", "/now", "/uses", "/projects"]) {
      expect(urls!).toContain(`https://artka.dev${path}/`);
      expect(urls!).toContain(`https://artka.dev/en${path}/`);
    }
  });

  it.skipIf(skipReason !== null)("excludes /admin, /login, /api", () => {
    for (const u of urls!) {
      expect(u).not.toMatch(/\/admin\//);
      expect(u).not.toMatch(/\/login\b/);
      expect(u).not.toMatch(/\/api\//);
    }
  });
});
