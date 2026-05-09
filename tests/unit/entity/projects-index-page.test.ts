import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ruP = join(process.cwd(), "src/pages/projects/index.astro");
const enP = join(process.cwd(), "src/pages/en/projects/index.astro");

describe.each([
  ["ru", ruP],
  ["en", enP],
])("/%s/projects index page", (_l, p) => {
  it("exists", () => expect(existsSync(p)).toBe(true));
  const src = existsSync(p) ? readFileSync(p, "utf8") : "";

  it("loads projects collection filtered by locale", () => {
    expect(src).toMatch(/getCollection\(["']projects["']/);
  });
  it("emits CollectionPage and BreadcrumbList via extraSchemaNodes", () => {
    expect(src).toMatch(/buildCollectionPageNode/);
    expect(src).toMatch(/buildBreadcrumbsNode/);
    expect(src).toMatch(/extraSchemaNodes=\{\[collectionNode,\s*breadcrumbsNode\]\}/);
  });
  it("uses fullWidth", () => expect(src).toMatch(/fullWidth=\{true\}/));
  it("imports from ~/lib/seo/schema", () => {
    expect(src).toMatch(/from\s+["']~\/lib\/seo\/schema["']/);
  });
});
