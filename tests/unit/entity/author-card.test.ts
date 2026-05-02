import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "src/components/AuthorCard.astro");

describe("src/components/AuthorCard.astro", () => {
  it("exists", () => expect(existsSync(path)).toBe(true));
  const src = existsSync(path) ? readFileSync(path, "utf8") : "";

  it("imports person from ~/lib/seo/person", () => {
    expect(src).toMatch(/from\s+["']~\/lib\/seo\/person["']/);
  });
  it("imports t and getLocaleFromPath", () => {
    expect(src).toMatch(/import\s+\{[^}]*t[^}]*\}\s+from\s+["']~\/i18n["']/);
    expect(src).toMatch(/getLocaleFromPath/);
  });
  it("renders an avatar image using person.image", () => {
    expect(src).toMatch(/person\.image/);
    expect(src).toMatch(/<img[^>]+alt=/);
  });
  it("links to /about and /projects (locale-aware)", () => {
    expect(src).toMatch(/\/about/);
    expect(src).toMatch(/\/projects/);
  });
  it("has no client:* directive (server-only)", () => {
    expect(src).not.toMatch(/client:(load|idle|visible|media|only)/);
  });
});
