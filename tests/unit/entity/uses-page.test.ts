import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ruP = join(process.cwd(), "src/pages/uses.astro");
const enP = join(process.cwd(), "src/pages/en/uses.astro");

describe.each([
  ["ru", ruP],
  ["en", enP],
])("/%s/uses page", (_l, p) => {
  it("exists", () => expect(existsSync(p)).toBe(true));
  const src = existsSync(p) ? readFileSync(p, "utf8") : "";
  it("loads 'uses' from site collection", () => {
    expect(src).toMatch(/getEntry\(["']site["'],\s*[^)]*uses[^)]*\)/);
  });
  it("emits WebPage + breadcrumbs via buildLandingNodes", () => {
    expect(src).toMatch(/buildLandingNodes/);
    expect(src).toMatch(/extraSchemaNodes=\{nodes\}/);
  });
});
