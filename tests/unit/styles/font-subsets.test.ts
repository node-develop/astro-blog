import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * src/styles/fonts.css ships only latin + cyrillic @font-face subsets
 * (see plan: stage 1, section C). Any letter outside those ranges falls
 * back to Georgia/system-ui mid-sentence — a silent visual regression.
 * This test scans content + i18n strings for offending letters so the
 * gap surfaces at test time, not on a live page.
 */

// Ranges declared in src/styles/fonts.css `unicode-range`, collapsed to
// closed [start, end] codepoint intervals. Punctuation/symbols are
// intentionally excluded from the *check* (see isLetter below) even
// though the fonts also cover them.
const ALLOWED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x00ff], // ASCII + Latin-1
  [0x0131, 0x0131], // latin small letter dotless i
  [0x0152, 0x0153], // latin OE / oe ligature
  [0x02bb, 0x02bc], // modifier letter turned comma / apostrophe
  [0x2000, 0x206f], // general punctuation
  [0x20ac, 0x20ac], // euro sign
  [0x2116, 0x2116], // numero sign
  [0x2122, 0x2122], // trademark
  [0x2191, 0x2191], // arrow up
  [0x2193, 0x2193], // arrow down
  [0x2212, 0x2212], // minus sign
  [0x2215, 0x2215], // division slash
  [0x0301, 0x0301], // combining acute (cyrillic stress mark)
  [0x0400, 0x045f], // cyrillic
  [0x0490, 0x0491], // cyrillic ghe with upturn
  [0x04b0, 0x04b1], // cyrillic straight u
];

const isAllowedCodepoint = (codepoint: number): boolean =>
  ALLOWED_RANGES.some(([start, end]) => codepoint >= start && codepoint <= end);

// Only letters (Unicode category L) fall back to a visibly different font
// when unsupported — symbols, emoji, CJK-in-code-fences, box drawing, etc.
// are not letters and are out of scope for this guard.
const LETTER_RE = /\p{L}/u;

type Offense = { readonly file: string; readonly char: string; readonly codepoint: string };

const walk = (dir: string, predicate: (name: string) => boolean, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, predicate, acc);
    else if (predicate(entry)) acc.push(full);
  }
  return acc;
};

const findOffenses = (filePath: string): Offense[] => {
  const text = readFileSync(filePath, "utf8");
  const offenses: Offense[] = [];
  for (const char of text) {
    if (!LETTER_RE.test(char)) continue;
    const codepoint = char.codePointAt(0)!;
    if (!isAllowedCodepoint(codepoint)) {
      offenses.push({
        file: filePath,
        char,
        codepoint: `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`,
      });
    }
  }
  return offenses;
};

describe("font subsets cover all letters used in content + UI strings", () => {
  const contentDir = join(process.cwd(), "src/content");
  const i18nDir = join(process.cwd(), "src/i18n");

  const contentFiles = walk(contentDir, (name) => [".md", ".mdx"].includes(extname(name)));
  const stringsFiles = walk(i18nDir, (name) => /^strings\..*\.json$/.test(name));

  const allOffenses = [...contentFiles, ...stringsFiles].flatMap(findOffenses);

  it("has no letters outside the latin ∪ cyrillic @font-face subsets", () => {
    if (allOffenses.length > 0) {
      const report = allOffenses
        .map(({ file, char, codepoint }) => `  ${file}: "${char}" (${codepoint})`)
        .join("\n");
      throw new Error(
        `Found ${allOffenses.length} letter(s) outside latin/cyrillic font subsets:\n${report}`,
      );
    }
    expect(allOffenses).toHaveLength(0);
  });
});
