// `prefetchAll` with the `viewport` strategy made the browser download every
// internal link that scrolled into view: ~317 KB on /blog/ against a 9.5 KB
// page, including the RSS and JSON feeds, which ClientRouter can never
// navigate to. Two rules keep that from coming back: the default strategy is
// not viewport, and any link to a non-HTML resource opts out by hand.
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

/** `<a>` tags inside the site footer of a built document. */
const footerAnchors = (markup: string): readonly string[] => {
  const footer = /<footer\b[^>]*class="site-footer"[^>]*>([\s\S]*?)<\/footer>/i.exec(markup)?.[1];
  return footer === undefined ? [] : [...footer.matchAll(/<a\b[^>]*>/gi)].map(([tag]) => tag);
};

const hrefOf = (tag: string): string => /\bhref="([^"]*)"/i.exec(tag)?.[1] ?? "";

/** A feed link: an in-site path whose last segment is a file, not a page. */
const isFeedLink = (href: string): boolean =>
  href.startsWith("/") && /\/(rss\.xml|feed\.json)$/.test(href);

describe("prefetch policy", () => {
  const built = existsSync(CLIENT);
  if (!built) throw new Error("dist/client not found — run `pnpm build` first");

  it("opts every footer feed link out of prefetching", () => {
    const pages = collectHtml(CLIENT).map((file) => ({
      path: relative(CLIENT, file),
      markup: readFileSync(file, "utf8"),
    }));
    expect(pages.length).toBeGreaterThan(0);

    const feedAnchors = pages.flatMap((page) =>
      footerAnchors(page.markup)
        .filter((tag) => isFeedLink(hrefOf(tag)))
        .map((tag) => ({ page: page.path, tag })),
    );
    // Both feeds appear in the footer of every page, so an empty list means
    // the selector stopped matching, not that the rule holds.
    expect(feedAnchors.length).toBeGreaterThan(0);

    for (const { page, tag } of feedAnchors) {
      expect(tag, `${page}: ${hrefOf(tag)}`).toContain('data-astro-prefetch="false"');
    }
  });
});
