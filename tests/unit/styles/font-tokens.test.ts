import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Two monospace tokens, two jobs (SEO audit item 23).
 *
 * `--font-mono` is decoration — logo, eyebrows, footer headings, labels —
 * and is referenced by ~76 files we do not want to touch. It must stay a
 * SYSTEM stack: a `@font-face` declaration downloads nothing, but a
 * rendered element whose family resolves to "JetBrains Mono Variable"
 * pulls a 52 KB woff2, and the home page has no code on it at all.
 *
 * `--font-code` is the only token allowed to name the JetBrains webfont,
 * and only code (`code`, `pre`, `kbd`, `samp`) plus the code-block chrome
 * may use it. Keeping that invariant is what keeps the woff2 off every
 * page without a code element.
 *
 * These checks parse the CSS text — no line numbers, no fixed selector
 * lists — so they keep holding as rules move around.
 */

const STYLES_DIR = join(process.cwd(), "src/styles");

const WEBFONT_FAMILY = "JetBrains Mono";
const CODE_TOKEN = "--font-code";
const DECORATIVE_TOKEN = "--font-mono";

/** A flat CSS rule: its selector (or at-rule name) and its declarations. */
type Rule = {
  readonly file: string;
  readonly selector: string;
  readonly declarations: readonly Declaration[];
};

type Declaration = { readonly property: string; readonly value: string };

/** Comments may legitimately mention the webfont; they render nothing. */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Innermost `{ ... }` blocks only. At-rule preludes (`@media (...)`) are
 * skipped because a prelude is never followed directly by declarations;
 * `@font-face` / `@theme` / `:root` are captured like any other rule.
 */
const BLOCK_RE = /([^{}]+)\{([^{}]*)\}/g;

const parseDeclarations = (body: string): Declaration[] =>
  body
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes(":"))
    .map((part) => {
      const colon = part.indexOf(":");
      return { property: part.slice(0, colon).trim(), value: part.slice(colon + 1).trim() };
    });

const parseRules = (file: string, css: string): Rule[] => {
  const rules: Rule[] = [];
  for (const match of stripComments(css).matchAll(BLOCK_RE)) {
    rules.push({
      file,
      selector: match[1].trim().replace(/\s+/g, " "),
      declarations: parseDeclarations(match[2]),
    });
  }
  return rules;
};

/**
 * True when the selector targets one of the code elements as an ELEMENT,
 * not as part of a class name: `.prose pre.astro-code` and
 * `.prose :not(pre) > code` match, `.code-block__lang` and
 * `.rehype-code-title` do not.
 */
const CODE_ELEMENT_RE = /(^|[\s>+~(,])(code|pre|kbd|samp)(?![\w-])/;

const targetsCodeElement = (selector: string): boolean =>
  selector
    .split(",")
    .map((part) => part.trim())
    .some((part) => CODE_ELEMENT_RE.test(part));

const cssFiles = readdirSync(STYLES_DIR)
  .filter((name) => name.endsWith(".css"))
  .map((name) => join(STYLES_DIR, name));

const allRules = cssFiles.flatMap((file) => parseRules(file, readFileSync(file, "utf8")));

/**
 * The MDX components ship their own scoped `<style>` blocks, and a scoped
 * rule always outranks the global `code, kbd, samp` one — so a component
 * that styles a code element decides that element's face on its own. They
 * are in scope for the same invariant.
 */
const MDX_DIR = join(process.cwd(), "src/components/mdx");

const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/g;

const mdxFiles = readdirSync(MDX_DIR)
  .filter((name) => name.endsWith(".astro"))
  .map((name) => join(MDX_DIR, name));

const mdxRules = mdxFiles.flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(STYLE_BLOCK_RE)].flatMap((block) =>
    parseRules(file, block[1]),
  ),
);

const where = (rule: Rule, declaration: Declaration): string =>
  `${rule.file.replace(process.cwd() + "/", "")} — ${rule.selector} { ${declaration.property}: ${declaration.value} }`;

describe("monospace font tokens", () => {
  it("parsed a non-trivial set of rules out of src/styles (sanity check)", () => {
    expect(cssFiles.length).toBeGreaterThanOrEqual(6);
    expect(allRules.length).toBeGreaterThan(50);
    // Guards the MDX half of the sweep against silently matching nothing.
    expect(mdxFiles.length).toBeGreaterThanOrEqual(5);
    expect(mdxRules.length).toBeGreaterThan(30);
  });

  it("names the JetBrains webfont only in @font-face and in the code token", () => {
    const mentions = allRules.flatMap((rule) =>
      rule.declarations
        .filter((declaration) => declaration.value.includes(WEBFONT_FAMILY))
        .map((declaration) => ({ rule, declaration })),
    );

    // The @font-face blocks (latin + cyrillic) plus the one token definition.
    expect(mentions.length).toBeGreaterThanOrEqual(3);

    const stray = mentions
      .filter(({ rule, declaration }) => {
        const isFaceDeclaration =
          rule.selector.startsWith("@font-face") && declaration.property === "font-family";
        const isCodeToken = declaration.property === CODE_TOKEN;
        return !isFaceDeclaration && !isCodeToken;
      })
      .map(({ rule, declaration }) => where(rule, declaration));

    expect(
      stray,
      `"${WEBFONT_FAMILY}" must reach elements only through var(${CODE_TOKEN}); ` +
        `naming it in a rule makes the 52 KB woff2 load on pages with no code.`,
    ).toEqual([]);

    // Every mention lives inside a parsed block — none leaks outside one.
    const inBlocks = mentions.length;
    const inFiles = cssFiles
      .map((file) => stripComments(readFileSync(file, "utf8")).split(WEBFONT_FAMILY).length - 1)
      .reduce((sum, count) => sum + count, 0);
    expect(inBlocks).toBe(inFiles);

    const inComponents = mdxRules
      .flatMap((rule) =>
        rule.declarations
          .filter((declaration) => declaration.value.includes(WEBFONT_FAMILY))
          .map((declaration) => ({ rule, declaration })),
      )
      .map(({ rule, declaration }) => where(rule, declaration));

    expect(
      inComponents,
      `A scoped component rule naming "${WEBFONT_FAMILY}" bypasses the token entirely.`,
    ).toEqual([]);
  });

  it("keeps the decorative mono token on a system stack", () => {
    const definitions = allRules.flatMap((rule) =>
      rule.declarations.filter((declaration) => declaration.property === DECORATIVE_TOKEN),
    );

    expect(definitions.length).toBeGreaterThan(0);

    for (const definition of definitions) {
      expect(
        definition.value.includes(WEBFONT_FAMILY),
        `${DECORATIVE_TOKEN} is decoration on pages without code — it must not name a webfont, got: ${definition.value}`,
      ).toBe(false);
    }

    // tokens.css holds the real stack; global.css re-exports it through
    // @theme as a bare var(), which carries no families of its own.
    const stacks = definitions.filter((definition) => !/^var\([^)]+\)$/.test(definition.value));
    expect(stacks.length).toBeGreaterThan(0);
    for (const stack of stacks) {
      expect(stack.value).toMatch(/\bmonospace\b/);
    }
  });

  it("gives the code token the webfont with a monospace fallback", () => {
    const definitions = allRules.flatMap((rule) =>
      rule.declarations.filter((declaration) => declaration.property === CODE_TOKEN),
    );

    // tokens.css defines it; global.css re-exports it through @theme as var().
    const withFamily = definitions.filter((d) => d.value.includes(WEBFONT_FAMILY));
    expect(withFamily.length).toBeGreaterThan(0);
    for (const definition of withFamily) {
      expect(definition.value).toMatch(/\bmonospace\b/);
    }
  });

  it("styles every code/pre/kbd/samp rule with the code token", () => {
    const codeRules = [...allRules, ...mdxRules]
      .filter((rule) => targetsCodeElement(rule.selector))
      .flatMap((rule) =>
        rule.declarations
          .filter((declaration) => declaration.property === "font-family")
          .map((declaration) => ({ rule, declaration })),
      );

    expect(codeRules.length).toBeGreaterThanOrEqual(4);

    const wrong = codeRules
      .filter(({ declaration }) => declaration.value !== `var(${CODE_TOKEN})`)
      .map(({ rule, declaration }) => where(rule, declaration));

    expect(
      wrong,
      `Rules that target code elements must use var(${CODE_TOKEN}); anything else ` +
        `either loses the code face or drags the webfont onto decorative pages.`,
    ).toEqual([]);
  });
});
