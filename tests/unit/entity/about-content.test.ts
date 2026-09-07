import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe.each(["ru", "en"] as const)("about content (%s)", (locale) => {
  const prefix = locale === "en" ? "/en" : "";
  const md = readFileSync(join(process.cwd(), `src/content/site${prefix}/about.md`), "utf8");
  const body = md.replace(/^---[\s\S]*?---\r?\n/, "");

  it("has a title and a description", () => {
    expect(md).toMatch(/^---[\s\S]*?title:[^\n]+[\s\S]*?description:[^\n]+[\s\S]*?---/);
  });
  it("uses section headings without duplicating the page H1", () => {
    expect(body).toMatch(/^##\s+\S/m);
    expect(body).not.toMatch(/^#\s/m);
  });
  it("links to related pages in the same locale", () => {
    for (const route of ["blog", "projects", "now", "uses"]) {
      expect(body).toContain(`](${prefix}/${route}/)`);
    }
    if (locale === "en") expect(body).not.toMatch(/\]\(\/(?!en\/)[^)]+\)/);
  });
  it("offers a direct contact and a professional profile", () => {
    expect(body).toMatch(/\[[^\]]+\]\(mailto:[^)]+\)/);
    expect(body).toContain("https://github.com/node-develop");
  });
});
