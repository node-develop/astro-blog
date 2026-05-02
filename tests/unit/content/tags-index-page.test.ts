import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ru = readFileSync(join(process.cwd(), "src/pages/tags/index.astro"), "utf8");
const en = readFileSync(join(process.cwd(), "src/pages/en/tags/index.astro"), "utf8");

describe.each([
  ["ru", ru, "/tags/", "tags.title"],
  ["en", en, "/en/tags/", "tags.title"],
])("tags index — %s", (_locale, source, hrefPrefix, _titleKey) => {
  it("imports getOrderedPosts and the tag helper", () => {
    expect(source).toMatch(/from\s+["']~\/lib\/content\/loader["']/);
    expect(source).toMatch(/getAllTagSlugs|groupPostsByTag/);
  });

  it("emits a WebPage schema node via extraSchemaNodes", () => {
    expect(source).toMatch(/buildWebPageNode/);
    expect(source).toMatch(/extraSchemaNodes=\{/);
  });

  it("uses the correct locale-prefixed href for tag links", () => {
    expect(source).toContain(hrefPrefix);
  });

  it("renders an aria-labelled list", () => {
    expect(source).toMatch(/aria-label/);
  });

  it("is prerendered (default for static routes)", () => {
    // Default-static; verify there is no `prerender = false` opt-out.
    expect(source).not.toMatch(/export\s+const\s+prerender\s*=\s*false/);
  });
});
