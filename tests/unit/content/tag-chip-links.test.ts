import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const blogIndex = readFileSync(join(process.cwd(), "src/pages/blog/index.astro"), "utf8");
const blogIndexEn = readFileSync(join(process.cwd(), "src/pages/en/blog/index.astro"), "utf8");
const postLayout = readFileSync(join(process.cwd(), "src/layouts/PostLayout.astro"), "utf8");

describe("tag chips are anchors", () => {
  // Both files declare a locale-aware `tagsHrefBase` and use it as the chip prefix
  // (RU page → "/tags/", EN page → "/en/tags/"). The chip then interpolates `${tag}`.
  it("blog/index.astro renders tag chips as <a> with locale-aware /tags/<slug>", () => {
    expect(blogIndex).toMatch(/<a[^>]*class="list__tag-chip"/);
    expect(blogIndex).toMatch(
      /const tagsHrefBase = locale === "en" \? "\/en\/tags\/" : "\/tags\/"/,
    );
    expect(blogIndex).toMatch(/href=\{`\$\{tagsHrefBase\}\$\{[^}]+\}\/`\}/);
    expect(blogIndex).not.toMatch(/<span class="list__tag-chip">/);
  });

  it("en/blog/index.astro renders tag chips as <a> with /en/tags/<slug>", () => {
    expect(blogIndexEn).toMatch(/<a[^>]*class="list__tag-chip"/);
    expect(blogIndexEn).toMatch(/const tagsHrefBase = "\/en\/tags\/"/);
    expect(blogIndexEn).toMatch(/href=\{`\$\{tagsHrefBase\}\$\{[^}]+\}\/`\}/);
  });

  it("PostLayout.astro renders tag chips as <a> with locale-aware path", () => {
    expect(postLayout).toMatch(/<a[^>]*class="post__tag-chip"/);
    expect(postLayout).toMatch(/locale === "en" \? "\/en\/tags\/" : "\/tags\/"/);
    expect(postLayout).not.toMatch(/<span class="post__tag-chip">/);
  });

  it("PostLayout resolves display labels through the locale tag dicts", () => {
    // The tags.{ru,en}.json imports moved behind getTagDict() in
    // ~/lib/content/tags — the layout must still resolve labels through it
    // rather than rendering raw slugs.
    expect(postLayout).toMatch(/getTagDict/);
    expect(postLayout).toMatch(/resolveTagLabel/);
  });
});
