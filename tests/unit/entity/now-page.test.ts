import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ruP = join(process.cwd(), "src/pages/now.astro");
const enP = join(process.cwd(), "src/pages/en/now.astro");

describe.each([
  ["ru", ruP],
  ["en", enP],
])("/%s/now page", (_l, p) => {
  it("exists", () => expect(existsSync(p)).toBe(true));
  const src = existsSync(p) ? readFileSync(p, "utf8") : "";
  it("loads 'now' from site collection", () => {
    expect(src).toMatch(/getEntry\(["']site["'],\s*[^)]*now[^)]*\)/);
  });
  it("emits WebPage via extraSchemaNodes", () => {
    expect(src).toMatch(/buildWebPageNode/);
    expect(src).toMatch(/extraSchemaNodes=\{\[[^\]]*webPageNode[^\]]*\]\}/);
  });
  it("uses fullWidth", () => expect(src).toMatch(/fullWidth=\{true\}/));
});
