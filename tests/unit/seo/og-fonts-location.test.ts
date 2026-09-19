import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const ogImageSource = readFileSync(join(repoRoot, "src/lib/og/og-image.ts"), "utf8");

/**
 * `loadFonts` in `src/lib/og/og-image.ts` builds its font directory as
 * `join(root, ...segments)`. Pull those segments straight out of the source
 * instead of hardcoding a copy, so this test tracks the actual code path:
 * if the renderer's directory ever moves back under `public/`, this fails
 * without anyone touching the assertions.
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

describe("OG font files stay out of public/", () => {
  it("points the renderer at a build-only directory, not public/", () => {
    const segments = fontDirSegments();
    expect(segments[0]).not.toBe("public");
    expect(join(...segments)).not.toMatch(/^public[/\\]/);
  });

  it("has the three fonts the renderer reads at that build-only directory", () => {
    const dir = join(repoRoot, ...fontDirSegments());
    expect(existsSync(dir)).toBe(true);
    for (const file of [
      "SourceSerif4-SemiBold.ttf",
      "JetBrainsMono-Medium.ttf",
      "Inter-Regular.ttf",
    ]) {
      expect(existsSync(join(dir, file))).toBe(true);
    }
  });

  it("no longer serves the OG fonts publicly from public/fonts/og", () => {
    expect(existsSync(join(repoRoot, "public/fonts/og"))).toBe(false);
  });
});
