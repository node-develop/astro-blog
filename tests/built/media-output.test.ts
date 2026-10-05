import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  frontmatterOf,
  hasMermaid,
  hasNoCover,
  hasSizedCover,
  labelOf,
  pageFileOf,
  underTest,
} from "../support/snapshot";

const attribute = (tag: string, name: string): string | undefined =>
  tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1];

const { snapshot } = underTest;
const where = `snapshot ${underTest.path} (snapshotId ${snapshot.snapshotId})`;
const htmlOf = (a: (typeof snapshot.articles)[number]): string =>
  readFileSync(pageFileOf(a), "utf8");

// Each rule is "for every article with X, the page does Y". The articles with X come from the
// snapshot the site was built from; the fixture is guarded to have a subject for each of them
// in tests/unit/content/fixture-snapshot.test.ts.
describe("built post media", () => {
  // A post without a cover gets the decorative slug-seeded artwork banner (aria-hidden inline
  // SVG), never the /og-default.* placeholder as a cover image.
  it("renders the editorial artwork banner for an article without a cover", () => {
    const failures: string[] = [];
    for (const a of snapshot.articles.filter(hasNoCover)) {
      const html = htmlOf(a);
      if (!/class=["'][^"']*post__art[^"']*["']/.test(html))
        failures.push(`${labelOf(a)}: no post__art`);
      if (/class=["'][^"']*post__cover[^"']*["']/.test(html))
        failures.push(`${labelOf(a)}: has post__cover`);
      if (/og-default\.(svg|png)/.test(html)) failures.push(`${labelOf(a)}: has og-default`);
    }
    expect(failures, where).toEqual([]);
  });

  // The rule, not the numbers: a cover's intrinsic size is whatever the post's frontmatter
  // recorded for it. Hardcoded 1200×630 reserved an OG-card box for an image of another shape, so
  // the page shifted when the cover landed. The recorded size is the social image's, which is the
  // cover's size only while both fields name the same file: that is what hasSizedCover selects.
  it("sizes a real cover from the post's own frontmatter", () => {
    const failures: string[] = [];
    for (const a of snapshot.articles.filter(hasSizedCover)) {
      const fm = frontmatterOf(a);
      const cover = htmlOf(a).match(
        /<figure\b[^>]*class="post__cover"[^>]*>[\s\S]*?<img\b[^>]*>/,
      )?.[0];
      if (cover === undefined) {
        failures.push(`${labelOf(a)}: no figure.post__cover`);
        continue;
      }
      const actual = [
        attribute(cover, "width"),
        attribute(cover, "height"),
        attribute(cover, "loading"),
        attribute(cover, "fetchpriority"),
      ];
      const expected = [String(fm.socialImageWidth), String(fm.socialImageHeight), "eager", "high"];
      if (actual.join() !== expected.join())
        failures.push(
          `${labelOf(a)}: [width,height,loading,fetchpriority] ${actual} != ${expected}`,
        );
    }
    expect(failures, where).toEqual([]);
  });

  it("lazily decodes Mermaid images produced during the Markdown build", () => {
    const failures: string[] = [];
    for (const a of snapshot.articles.filter(hasMermaid)) {
      const images =
        htmlOf(a).match(/<img\b(?=[^>]*\bsrc=["']data:image\/svg\+xml,)[^>]*>/gi) ?? [];
      if (images.length === 0) failures.push(`${labelOf(a)}: no data:image/svg img`);
      for (const tag of images) {
        if (attribute(tag, "loading") !== "lazy" || attribute(tag, "decoding") !== "async")
          failures.push(`${labelOf(a)}: ${tag.slice(0, 80)}`);
      }
    }
    expect(failures, where).toEqual([]);
  });
});
