import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ru = readFileSync(join(process.cwd(), "src/pages/about.astro"), "utf8");
const en = readFileSync(join(process.cwd(), "src/pages/en/about.astro"), "utf8");

describe.each([
  ["ru", ru],
  ["en", en],
])("/%s/about page wires WebPage JSON-LD", (_l, src) => {
  it("imports buildWebPageNode from ~/lib/seo/schema", () => {
    expect(src).toMatch(
      /import\s*\{[^}]*buildWebPageNode[^}]*\}\s+from\s+["']~\/lib\/seo\/schema["']/,
    );
  });
  it("passes the WebPage node through extraSchemaNodes", () => {
    expect(src).toMatch(/extraSchemaNodes=\{\[[^\]]*webPageNode[^\]]*\]\}/);
  });
  it("uses canonical and getLocaleFromPath", () => {
    expect(src).toMatch(/const\s+canonical\s*=/);
    expect(src).toMatch(/getLocaleFromPath/);
  });
});
