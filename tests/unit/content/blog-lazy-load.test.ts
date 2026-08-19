import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_PAGE_SIZE } from "~/lib/content/blog-pagination";

const read = (p: string): string => readFileSync(join(process.cwd(), p), "utf8");

const indexes = ["src/pages/blog/index.astro", "src/pages/en/blog/index.astro"];
const partials = [
  "src/pages/blog/partials/[page].astro",
  "src/pages/en/blog/partials/[page].astro",
];

// Source-level assertions in the style of tag-chip-links.test.ts — the
// lazy-load wiring lives in page frontmatter/markup, so we pin the
// structure both locales must share.
describe("blog index lazy loading", () => {
  it("keeps the page size shared and sane", () => {
    expect(Number.isInteger(BLOG_PAGE_SIZE)).toBe(true);
    expect(BLOG_PAGE_SIZE).toBeGreaterThanOrEqual(2);
  });

  for (const p of indexes) {
    it(`${p} renders the first page slice and arms the sentinel`, () => {
      const s = read(p);
      expect(s).toMatch(/posts\.slice\(0, BLOG_PAGE_SIZE\)/);
      expect(s).toMatch(/initialPosts\.map/);
      expect(s).toMatch(/data-blog-grid/);
      expect(s).toMatch(/data-blog-sentinel/);
      expect(s).toMatch(/data-next-page="2"/);
      expect(s).toMatch(/initLazyPostList/);
      expect(s).toMatch(/astro:page-load/);
      // Entrance animation uses token durations (0ms under reduced motion).
      expect(s).toMatch(/is-entering/);
      expect(s).toMatch(/var\(--dur-slow\)/);
    });
  }

  for (const p of partials) {
    it(`${p} is a guarded SSR partial`, () => {
      const s = read(p);
      expect(s).toMatch(/export const partial = true/);
      expect(s).toMatch(/export const prerender = false/);
      // Fragments start at page 2 and 404 out of range.
      expect(s).toMatch(/page < 2/);
      expect(s).toMatch(/status: 404/);
      // Naked fragments must not be indexed.
      expect(s).toMatch(/X-Robots-Tag/);
      // Art variants come from the FULL list, sliced by absolute index —
      // lazy cards must match what a full server render would show.
      expect(s).toMatch(/assignArtVariants\(posts\.map/);
      expect(s).toMatch(/variants\[start \+ i\]/);
      expect(s).toMatch(/data-next-page=\{String\(page \+ 1\)\}/);
    });
  }

  it("RU and EN twins stay in sync (partials)", () => {
    const normalize = (s: string): string =>
      s
        .replaceAll("/en/blog/", "/blog/")
        .replaceAll('"en" as const', '"ru" as const')
        .replace(/\/\*\*[\s\S]*?\*\//, "");
    expect(normalize(read(partials[0]!))).toBe(normalize(read(partials[1]!)));
  });
});
