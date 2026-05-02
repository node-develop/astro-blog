import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ru = join(process.cwd(), "src/pages/projects/[slug].astro");
const en = join(process.cwd(), "src/pages/en/projects/[slug].astro");

describe.each([
  ["ru", ru],
  ["en", en],
])("/%s/projects/[slug]", (_l, p) => {
  it("exists", () => expect(existsSync(p)).toBe(true));
  const src = existsSync(p) ? readFileSync(p, "utf8") : "";
  it("declares getStaticPaths", () => {
    expect(src).toMatch(/export\s+(async\s+)?function\s+getStaticPaths/);
  });
  it("emits CreativeWork node via extraSchemaNodes", () => {
    expect(src).toMatch(/buildCreativeWorkNode/);
    expect(src).toMatch(/extraSchemaNodes=\{\[/);
  });
  it("emits a BreadcrumbList node", () => {
    expect(src).toMatch(/buildBreadcrumbListNode/);
  });
  it("renders body via render(entry)", () => {
    expect(src).toMatch(/await\s+render\(entry\)/);
  });
});
