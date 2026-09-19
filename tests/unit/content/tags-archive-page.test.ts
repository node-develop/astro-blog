import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ru = readFileSync(join(process.cwd(), "src/pages/tags/[tag].astro"), "utf8");
const en = readFileSync(join(process.cwd(), "src/pages/en/tags/[tag].astro"), "utf8");

describe.each([
  ["ru", ru, "ru"],
  ["en", en, "en"],
])("tags archive — %s", (_label, source, locale) => {
  it("declares getStaticPaths", () => {
    expect(source).toMatch(/export\s+(?:(?:async\s+)?function|const)\s+getStaticPaths/);
  });

  it("enumerates slugs from BOTH locales (union, not just current)", () => {
    expect(source).toMatch(/getAllTagSlugs/);
    expect(source).toMatch(/locale:\s*"ru"/);
    expect(source).toMatch(/locale:\s*"en"/);
  });

  it("emits a Blog node with blogPost listing", () => {
    expect(source).toMatch(/"@type":\s*"Blog"/);
    expect(source).toMatch(/blogPost:/);
  });

  it("uses BreadcrumbList linking back to /tags index", () => {
    // Source emits the BreadcrumbList via buildBreadcrumbsNode (the
    // canonical builder in src/lib/seo/nodes-page.ts) and references
    // /tags as the second crumb, before the leaf tag label.
    expect(source).toMatch(/buildBreadcrumbsNode/);
    expect(source).toMatch(/\/tags/);
    expect(source).toMatch(/"tags\.title"/);
  });

  it(`includes a localized empty-state for slugs missing in ${locale}`, () => {
    const expectedKey = locale === "ru" ? /tags\.archiveEmptyRu/ : /tags\.archiveEmptyEn/;
    expect(source).toMatch(expectedKey);
  });

  it("keeps the hash out of the heading text and paints it from CSS instead", () => {
    // "#" is decoration. In the heading text it ends up in the H1 that search
    // engines and screen readers read; as a pseudo-element it stays visual.
    expect(source).toMatch(/<h1 class="tag-archive__title">\{label\}<\/h1>/);
    expect(source).not.toMatch(/<h1[^>]*>#/);
    expect(source).toMatch(/\.tag-archive__title::before\s*\{[^}]*content:\s*"#"/);
  });

  it("takes the title and the lede from the archive templates, not a bare label", () => {
    expect(source).toMatch(/tags\.archiveTitle/);
    expect(source).toMatch(/tags\.archiveDescription/);
  });
});
