import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const postLayout = readFileSync(join(process.cwd(), "src/layouts/PostLayout.astro"), "utf8");

// Source-level assertions in the style of tag-chip-links.test.ts: the
// editorial cover logic is frontmatter in a layout, so we pin the branch
// structure rather than rendered output.
describe("post cover vs editorial artwork", () => {
  it("treats /og-default.* placeholders as 'no real cover'", () => {
    expect(postLayout).toMatch(/og-default\\\.\(svg\|png\)/);
    expect(postLayout).toMatch(/hasRealCover/);
  });

  it("renders a real cover image OR the slug-seeded CardArt banner", () => {
    expect(postLayout).toMatch(/hasRealCover \? \(/);
    expect(postLayout).toMatch(/class="post__cover"/);
    expect(postLayout).toMatch(/class="post__art"/);
    expect(postLayout).toMatch(/<CardArt seed=\{slug\} \/>/);
  });

  it("never ships the SVG placeholder into BlogPosting.image", () => {
    // absoluteCover must branch on hasRealCover and fall back to the
    // per-post raster (ogImagePath), not og-default.svg/png.
    expect(postLayout).toMatch(/absoluteCover[\s\S]{0,120}hasRealCover/);
    expect(postLayout).toMatch(/new URL\(ogImagePath, siteBase\)/);
    expect(postLayout).not.toMatch(/og-default\.png", siteBase/);
  });
});
