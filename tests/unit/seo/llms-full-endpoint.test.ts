import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const path = join(process.cwd(), "src/pages/llms-full.txt.ts");

describe("llms-full.txt endpoint source", () => {
  const source = readFileSync(path, "utf8");

  it("declares prerender = true (built into static dist/)", () => {
    expect(source).toMatch(/export\s+const\s+prerender\s*=\s*true/);
  });

  it("returns text/plain", () => {
    expect(source).toMatch(/Content-Type[^\n]+text\/plain/);
  });

  it("loads ordered posts via the shared loader", () => {
    expect(source).toMatch(/from\s+["']~\/lib\/content\/loader["']/);
  });

  it("references the Person source of truth", () => {
    expect(source).toMatch(/from\s+["']~\/lib\/seo\/person["']/);
  });
});
