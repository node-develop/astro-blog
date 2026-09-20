import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const ogImageSource = readFileSync(join(repoRoot, "src/lib/og/og-image.ts"), "utf8");

/**
 * `loadFonts` in `src/lib/og/og-image.ts` builds its font directory as
 * `join(root, ...segments)` and then reads each face as `join(dir, "<file>")`.
 * Pull both out of the source instead of hardcoding copies, so this test
 * tracks the actual code path: if the renderer's directory ever moves back
 * under `public/`, or a face is renamed without the file landing next to it,
 * this fails without anyone touching the assertions.
 */
const fontDirSegments = (): readonly string[] => {
  const match = ogImageSource.match(/const dir = join\(root,\s*([^)]+)\)/);
  if (!match) {
    throw new Error("og-image.ts: could not find the `const dir = join(root, ...)` expression");
  }
  return match[1]
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const quoted = segment.match(/^"([^"]*)"$/);
      if (!quoted) {
        throw new Error(`og-image.ts: unexpected font directory segment "${segment}"`);
      }
      return quoted[1];
    });
};

const fontFileNames = (): readonly string[] => {
  const names = [...ogImageSource.matchAll(/join\(dir,\s*"([^"]+)"\)/g)].map((m) => m[1]);
  if (names.length === 0) {
    throw new Error('og-image.ts: could not find any `join(dir, "…")` font reads');
  }
  return [...new Set(names)];
};

describe("OG font files stay out of public/", () => {
  it("points the renderer at a build-only directory, not public/", () => {
    const segments = fontDirSegments();
    expect(segments[0]).not.toBe("public");
    expect(join(...segments)).not.toMatch(/^public[/\\]/);
  });

  it("ships every font the renderer reads at that build-only directory", () => {
    const dir = join(repoRoot, ...fontDirSegments());
    expect(existsSync(dir)).toBe(true);
    const names = fontFileNames();
    // Latin + Cyrillic for both the display and the text face.
    expect(names.length).toBeGreaterThanOrEqual(4);
    for (const file of names) {
      expect(existsSync(join(dir, file)), `missing OG font: ${file}`).toBe(true);
    }
  });

  it("no longer serves the OG fonts publicly from public/fonts/og", () => {
    expect(existsSync(join(repoRoot, "public/fonts/og"))).toBe(false);
  });
});
