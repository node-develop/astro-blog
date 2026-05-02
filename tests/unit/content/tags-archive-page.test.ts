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
    expect(source).toMatch(/"@type":\s*"BreadcrumbList"/);
  });

  it(`includes a localized empty-state for slugs missing in ${locale}`, () => {
    const expectedKey = locale === "ru" ? /tags\.archiveEmptyRu/ : /tags\.archiveEmptyEn/;
    expect(source).toMatch(expectedKey);
  });
});
