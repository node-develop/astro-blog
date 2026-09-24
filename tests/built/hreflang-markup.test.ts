// Page markup and the XML sitemap are two independent sets of hints about the
// same addresses. When they disagree — `ru-RU`/`en-US` in the <head>, `ru`/`en`
// in the sitemap — a search engine has to pick one, and the region-scoped form
// excludes every English reader outside the US: they fall through to x-default,
// which points at the Russian page. These tests hold the two sets identical and
// keep the cluster off pages that must not advertise one at all.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const CLIENT = join(process.cwd(), "dist", "client");

const collectHtml = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return collectHtml(full);
    return entry.isFile() && entry.name.endsWith(".html") ? [full] : [];
  });

/** `hreflang` values declared by `<link rel="alternate">` tags in a document. */
const markupCodes = (markup: string): readonly string[] =>
  [...markup.matchAll(/<link\b[^>]*\brel="alternate"[^>]*>/gi)]
    .map(([tag]) => /\bhreflang="([^"]*)"/i.exec(tag)?.[1])
    .filter((code): code is string => code !== undefined);

/** `hreflang` values declared anywhere in a sitemap document. */
const sitemapCodes = (xml: string): readonly string[] =>
  [...xml.matchAll(/\bhreflang="([^"]*)"/gi)].map((match) => match[1] as string);

const carriesNoindex = (markup: string): boolean =>
  /<meta\b[^>]*\bname="robots"[^>]*\bcontent="[^"]*noindex/i.test(markup);

interface BuiltPage {
  readonly path: string;
  readonly markup: string;
}

const loadBuild = (): {
  readonly pages: readonly BuiltPage[];
  readonly sitemaps: readonly string[];
} | null => {
  if (!existsSync(CLIENT)) return null;
  const sitemapFiles = readdirSync(CLIENT).filter((file) => /^sitemap-(ru|en)\.xml$/.test(file));
  if (sitemapFiles.length === 0) return null;
  return {
    pages: collectHtml(CLIENT).map((file) => ({
      path: relative(CLIENT, file),
      markup: readFileSync(file, "utf8"),
    })),
    sitemaps: sitemapFiles.map((file) => readFileSync(join(CLIENT, file), "utf8")),
  };
};

describe("hreflang markup on the built site", () => {
  const build = loadBuild();
  if (!build)
    throw new Error("dist/client + sitemap-{ru,en}.xml not found — run `pnpm build` first");

  it("declares only language codes the site actually serves", () => {
    const pages = build.pages;
    // A build with no pages, or no page carrying a cluster, would make every
    // assertion below pass by saying nothing. Both are failures in themselves.
    expect(pages.length).toBeGreaterThan(0);
    const withCluster = pages.filter((page) => markupCodes(page.markup).length > 0);
    expect(withCluster.length).toBeGreaterThan(0);

    const allowed = new Set(["ru", "en", "x-default"]);
    for (const page of withCluster) {
      for (const code of markupCodes(page.markup)) {
        expect(allowed.has(code), `${page.path} declares hreflang="${code}"`).toBe(true);
      }
    }
  });

  it("uses the same code vocabulary as the built sitemaps", () => {
    const inMarkup = new Set(build.pages.flatMap((page) => markupCodes(page.markup)));
    const inSitemaps = new Set(build.sitemaps.flatMap(sitemapCodes));
    // Neither side may be empty: an empty set equals an empty set, and the
    // whole point of the check is that both sides say the same something.
    expect(inSitemaps.size).toBeGreaterThan(0);
    expect([...inMarkup].sort()).toEqual([...inSitemaps].sort());
  });

  it("keeps the cluster off pages closed to indexing", () => {
    const noindexPages = build.pages.filter((page) => carriesNoindex(page.markup));
    // If the build stops emitting noindex pages entirely this check has
    // nothing left to protect, and silence would be the wrong answer.
    expect(noindexPages.length).toBeGreaterThan(0);
    for (const page of noindexPages) {
      expect(markupCodes(page.markup), `${page.path} is noindex`).toEqual([]);
    }
  });
});
