import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const blogIndex = readFileSync(join(process.cwd(), "src/pages/blog/index.astro"), "utf8");
const blogIndexEn = readFileSync(join(process.cwd(), "src/pages/en/blog/index.astro"), "utf8");
const postLayout = readFileSync(join(process.cwd(), "src/layouts/PostLayout.astro"), "utf8");

describe("tag chips are anchors", () => {
  it("blog/index.astro renders tag chips as <a> with /tags/<slug>", () => {
    expect(blogIndex).toMatch(/<a[^>]*class="list__tag-chip"/);
    expect(blogIndex).toMatch(/href=\{`\/tags\/\$\{[^}]+\}`\}/);
    expect(blogIndex).not.toMatch(/<span class="list__tag-chip">/);
  });

  it("en/blog/index.astro renders tag chips as <a> with /en/tags/<slug>", () => {
    expect(blogIndexEn).toMatch(/<a[^>]*class="list__tag-chip"/);
    expect(blogIndexEn).toMatch(/href=\{`\/en\/tags\/\$\{[^}]+\}`\}/);
  });

  it("PostLayout.astro renders tag chips as <a> with locale-aware path", () => {
    expect(postLayout).toMatch(/<a[^>]*class="post__tag-chip"/);
    expect(postLayout).toMatch(/locale === "en" \? "\/en\/tags\/" : "\/tags\/"/);
    expect(postLayout).not.toMatch(/<span class="post__tag-chip">/);
  });

  it("PostLayout resolves display labels through tags.{ru,en}.json", () => {
    expect(postLayout).toMatch(/tags\.(ru|en)\.json/);
    expect(postLayout).toMatch(/resolveTagLabel/);
  });
});
