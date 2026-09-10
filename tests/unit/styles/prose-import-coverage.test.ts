import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `.prose` typography (Tailwind's `@tailwindcss/typography` plugin) lives
 * in src/styles/content.css, a second Tailwind entry split out of
 * global.css so non-content pages (/, /blog/, /tags, 404, /admin) don't
 * ship it. Every file that renders `class="prose"` must either import
 * content.css directly, or be one of the three layouts that already do
 * (PostLayout, LessonLayout, CourseLayout) — a page using those layouts
 * gets the styling transitively. This guards against a future `.prose`
 * page shipping unstyled markdown.
 */

const PROSE_CLASS_RE = /class="[^"]*\bprose\b[^"]*"/;
const CONTENT_IMPORT_RE = /import\s+["']~\/styles\/content\.css["']/;

const LAYOUTS_THAT_IMPORT_CONTENT_CSS = [
  "src/layouts/PostLayout.astro",
  "src/layouts/LessonLayout.astro",
  "src/layouts/CourseLayout.astro",
] as const;

const walkAstroFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walkAstroFiles(full, acc);
    else if (entry.endsWith(".astro")) acc.push(full);
  }
  return acc;
};

const usesOneOfTheProseLayouts = (source: string): boolean =>
  /<(PostLayout|LessonLayout|CourseLayout)\b/.test(source);

describe("every .prose consumer loads content.css (directly or via layout)", () => {
  const root = process.cwd();
  const candidateDirs = ["src/pages", "src/layouts", "src/components"].map((d) => join(root, d));
  const allFiles = candidateDirs.flatMap((dir) => walkAstroFiles(dir));

  const proseFiles = allFiles.filter((file) => PROSE_CLASS_RE.test(readFileSync(file, "utf8")));

  it("found the expected set of .prose consumers (sanity check, not empty)", () => {
    expect(proseFiles.length).toBeGreaterThan(0);
  });

  it.each(proseFiles)("%s imports content.css or delegates to a prose layout", (file) => {
    const relative = file.replace(`${root}/`, "");
    const source = readFileSync(file, "utf8");
    const isProseLayout = (LAYOUTS_THAT_IMPORT_CONTENT_CSS as readonly string[]).includes(relative);
    const ok = isProseLayout || CONTENT_IMPORT_RE.test(source) || usesOneOfTheProseLayouts(source);
    expect(ok, `${relative} renders class="prose" but never loads content.css`).toBe(true);
  });
});

describe("prose layouts import content.css directly (not just transitively)", () => {
  it.each(LAYOUTS_THAT_IMPORT_CONTENT_CSS)("%s imports content.css", (relPath) => {
    const source = readFileSync(join(process.cwd(), relPath), "utf8");
    expect(
      CONTENT_IMPORT_RE.test(source),
      `${relPath} no longer imports ~/styles/content.css`,
    ).toBe(true);
  });
});

describe("content.css declares the full Tailwind layer order before any @import", () => {
  const contentCss = readFileSync(join(process.cwd(), "src/styles/content.css"), "utf8");
  const LAYER_STATEMENT = "@layer properties, theme, base, components, utilities;";

  it("contains the exact layer statement", () => {
    expect(contentCss).toContain(LAYER_STATEMENT);
  });

  it("declares the layer statement before the first @import", () => {
    const layerIndex = contentCss.indexOf(LAYER_STATEMENT);
    const firstImportIndex = contentCss.indexOf("@import");
    expect(layerIndex).toBeGreaterThanOrEqual(0);
    expect(firstImportIndex).toBeGreaterThanOrEqual(0);
    expect(layerIndex).toBeLessThan(firstImportIndex);
  });
});

describe("global.css no longer carries content-only CSS", () => {
  const globalCss = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8");

  it.each([
    ["katex", /katex/i],
    ["@tailwindcss/typography plugin", /@tailwindcss\/typography/],
    ["prose.css import", /prose\.css/],
    ["code-themes.css import", /code-themes\.css/],
    ["bare fontsource-variable imports", /@fontsource-variable\//],
  ])("does not contain %s", (_label, pattern) => {
    expect(globalCss).not.toMatch(pattern);
  });
});
