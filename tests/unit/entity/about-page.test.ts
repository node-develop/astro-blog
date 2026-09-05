import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ru = readFileSync(join(process.cwd(), "src/pages/about.astro"), "utf8");
const en = readFileSync(join(process.cwd(), "src/pages/en/about.astro"), "utf8");

describe.each([
  ["ru", ru],
  ["en", en],
])("/%s/about page wires WebPage JSON-LD", (_l, src) => {
  it("imports buildLandingNodes directly from ~/lib/seo/landing", () => {
    // After SEO-V the about page builds breadcrumbs + WebPage(AboutPage)
    // through the buildLandingNodes helper instead of calling
    // buildWebPageNode directly.
    expect(src).toMatch(
      /import\s*\{[^}]*buildLandingNodes[^}]*\}\s+from\s+["']~\/lib\/seo\/landing["']/,
    );
  });
  // SEO audit 2026-09: /about is the author's ProfilePage whose mainEntity is
  // the global #person node (AboutPage described the site, not the person).
  it("declares the ProfilePage type with #person as mainEntity", () => {
    expect(src).toMatch(/type:\s*["']ProfilePage["']/);
    expect(src).toMatch(/mainEntityId:\s*graphIds\.person/);
  });
  it("passes the helper output through extraSchemaNodes", () => {
    expect(src).toMatch(/extraSchemaNodes=\{nodes\}/);
  });
  it("uses canonical and getLocaleFromPath", () => {
    expect(src).toMatch(/const\s+canonical\s*=/);
    expect(src).toMatch(/getLocaleFromPath/);
  });
});
