import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { person } from "../src/lib/seo/person";
import { findDanglingGraphRefs, graphNodesOf } from "../src/lib/seo/graph-refs";
import { isLocale } from "../src/i18n";

type SeoBuildViolation = {
  readonly label: string;
  readonly pattern: RegExp;
};

const VIOLATIONS: ReadonlyArray<SeoBuildViolation> = [
  {
    label: "duplicate redirect route",
    pattern: /static route cannot be defined more than once/i,
  },
  {
    label: "invalid view-transition selector",
    pattern: /::view-transition-group\(\[transition-name\^=/i,
  },
  {
    label: "SEO chunk cycle",
    pattern: /buildLandingNodes[\s\S]{0,500}reexported through module/i,
  },
  {
    label: "font url() didn't resolve at build time",
    pattern: /didn't resolve at build time, it will remain unchanged/i,
  },
];

export const assertSeoBuildOutput = (output: string): string[] => {
  return diagnoseSeoBuildOutput(output).map(({ label }) => label);
};

const matchingBlock = (normalizedOutput: string, pattern: RegExp): string => {
  const match = pattern.exec(normalizedOutput);
  if (!match) return "(matching warning block unavailable)";
  const lines = normalizedOutput.split("\n");
  const lineIndex = normalizedOutput.slice(0, match.index).split("\n").length - 1;
  return lines.slice(Math.max(0, lineIndex - 2), Math.min(lines.length, lineIndex + 7)).join("\n");
};

export interface SeoBuildDiagnostic {
  readonly label: string;
  readonly block: string;
}

export const diagnoseSeoBuildOutput = (output: string): SeoBuildDiagnostic[] => {
  const normalizedOutput = stripVTControlCharacters(output);
  return VIOLATIONS.flatMap(({ label, pattern }) =>
    pattern.test(normalizedOutput)
      ? [{ label, block: matchingBlock(normalizedOutput, pattern) }]
      : [],
  );
};

const DIST_CLIENT_DIR = resolve(process.cwd(), "dist/client");
const PROBE_PAGE = "about/index.html";

/**
 * Fail-loud guard for the fontsource `?url`/`url()` dedup: Vite silently
 * warns (does not throw) when a `url()` inside CSS can't be resolved at
 * build time, leaving the original bare specifier in the emitted file —
 * a broken font request that looks like a successful build. Assert every
 * `<link rel="preload" as="font">` href on a real page appears verbatim
 * inside at least one emitted CSS file.
 */
export const assertFontPreloadsResolved = async (
  distClientDir: string = DIST_CLIENT_DIR,
): Promise<string[]> => {
  const probePath = resolve(distClientDir, PROBE_PAGE);
  const html = await readFile(probePath, "utf8").catch(() => null);
  if (html === null) return [`missing probe page: ${probePath}`];

  const preloadHrefs = [...html.matchAll(/<link\s+rel="preload"\s+as="font"[^>]*\shref="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((href): href is string => href !== undefined);
  if (preloadHrefs.length === 0) return ["no font preload <link> found on probe page"];

  const astroDir = resolve(distClientDir, "_astro");
  const cssFiles = (await readdir(astroDir)).filter((name) => name.endsWith(".css"));
  const cssContents = await Promise.all(
    cssFiles.map((name) => readFile(resolve(astroDir, name), "utf8")),
  );

  return preloadHrefs
    .filter((href) => !cssContents.some((css) => css.includes(href)))
    .map((href) => `font preload href not found in any emitted CSS: ${href}`);
};

/** `safeJsonLd` escapes `<` and `>`, so a block can never contain `</script>`. */
const JSON_LD_BLOCK =
  /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const HTML_LANG = /<html\b[^>]*\blang=["']([^"']*)["']/i;

const builtHtmlFiles = async (distClientDir: string): Promise<string[] | null> => {
  const entries = await readdir(distClientDir, { recursive: true, withFileTypes: true }).catch(
    () => null,
  );
  return entries === null
    ? null
    : entries
        .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".html"))
        .map((entry) => relative(distClientDir, join(entry.parentPath, entry.name)))
        .sort();
};

/**
 * Fail-loud guard against a JSON-LD `@graph` that points at nothing.
 *
 * Two dangling references shipped for months because nothing ever looked at
 * the markup: `BlogPosting.isPartOf` on every post named a `Blog` node the
 * post page did not emit, and `CollectionPage.hasPart` on the portfolio named
 * nodes that live on the project pages. Both parse, both validate, both
 * resolve to nothing — exactly the shape of error that looks like success.
 *
 * The rule itself lives in `src/lib/seo/graph-refs.ts` as pure data in / data
 * out, because only part of the site can be checked from `dist`: `/`, `/blog/`
 * and their EN twins are rendered on demand (`prerender = false`) and never
 * reach the build output. Those pages are covered by the production server
 * smoke test, which feeds the same function the HTML it fetches.
 */
export const assertNoDanglingGraphRefs = async (
  distClientDir: string = DIST_CLIENT_DIR,
): Promise<string[]> => {
  const files = await builtHtmlFiles(distClientDir);
  if (files === null) return [`build output is unreadable: ${distClientDir}`];

  const issues: string[] = [];
  let pagesWithJsonLd = 0;

  for (const file of files) {
    const page = file.split(sep).join("/");
    const html = await readFile(join(distClientDir, file), "utf8");
    const blocks = [...html.matchAll(JSON_LD_BLOCK)].map((match) => match[1] ?? "");
    // A page without JSON-LD is not an error: plenty of routes emit none.
    if (blocks.length === 0) continue;
    pagesWithJsonLd += 1;

    const lang = HTML_LANG.exec(html)?.[1];
    if (!isLocale(lang)) {
      issues.push(
        `${page}: carries JSON-LD but <html lang> is ${JSON.stringify(lang ?? null)}, not a site ` +
          `locale — the cross-locale exception cannot be applied to it`,
      );
      continue;
    }

    blocks.forEach((block, index) => {
      const label = blocks.length === 1 ? page : `${page} (block ${index + 1})`;
      let parsed: unknown;
      try {
        parsed = JSON.parse(block);
      } catch (error) {
        issues.push(
          `${label}: JSON-LD does not parse (${error instanceof Error ? error.message : String(error)})`,
        );
        return;
      }
      for (const ref of findDanglingGraphRefs({ graph: graphNodesOf(parsed), locale: lang })) {
        issues.push(`${label}: ${ref.path} -> ${ref.id}`);
      }
    });
  }

  // One page without JSON-LD is fine; a whole build without any means this
  // guard looked at nothing (BaseLayout emits a graph on every page) — the
  // extractor went blind, e.g. the markup of the <script> tag changed. Same
  // stance as "no font preload <link> found on probe page" above.
  if (pagesWithJsonLd === 0) {
    issues.push(
      `no JSON-LD block found in any of ${files.length} built page(s) under ${distClientDir} — ` +
        `nothing was checked`,
    );
  }

  return issues;
};

const OG_SOURCE_ROOTS: ReadonlyArray<string> = ["src/lib/og", "src/pages/og"];
const OG_BYLINE_SOURCE = "src/lib/og/og-image.ts";
const PERSON_MODULE = /from\s+["'][^"']*\/seo\/person["']/;

/**
 * Two-word capitalized phrases that are legitimately hardcoded under the OG
 * folders. Keep this list tiny and justified — every entry is a name-shaped
 * literal a reviewer has already looked at.
 *
 * Empty on purpose. The one entry this ever held was a Satori font-family
 * name, and a Satori family name is an internal handle we choose: the only
 * contract is that `fonts[].name` matches what `fontFamily` asks for, and
 * nothing about it reaches the card. So the renderer spells those handles
 * `Unbounded-Cyr` and `GolosText` rather than the way the foundry does, and
 * the guard stays strict instead of carrying a standing exception. Reach for
 * this list only for a literal that genuinely cannot be renamed.
 */
const OG_ALLOWED_LITERALS: ReadonlySet<string> = new Set<string>([]);

/** Double-quoted, single-quoted and template literals, comments included. */
const STRING_LITERAL = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

/**
 * "Firstname Lastname" in any script. The lookarounds are Unicode-aware on
 * purpose: a plain \b is ASCII-only, so it would refuse Cyrillic names and
 * would accept the tail of a CamelCase token (JetBrains Mono).
 */
const NAME_LIKE = /(?<![\p{L}\p{N}_])\p{Lu}\p{Ll}+[ \u00A0]\p{Lu}\p{Ll}+(?![\p{L}\p{N}_])/u;

/**
 * File types the literal scan can actually read. JSX text in a .tsx/.astro
 * card is not a string literal at all, so widening this list is not enough —
 * teach the scanner the new syntax first.
 */
const OG_SCANNED_EXTENSIONS: ReadonlySet<string> = new Set([".ts"]);

/**
 * Every file under the root, whatever its type: a file the scanner cannot
 * read must be reported, not dropped. A recursive readdir also lists the
 * folders themselves (`landing`, `[course]`), hence the Dirent filter.
 *
 * The one exception is an extensionless dotfile (`.DS_Store`, `.gitkeep`): the
 * OS or git puts those there, no module can import them, and refusing them
 * would turn the guard red on a developer's Mac for nothing. `.hidden.ts` has
 * an extension and is scanned like any other source.
 */
const isOsDotfile = (name: string): boolean => name.startsWith(".") && extname(name) === "";

const ogSourceFiles = async (dir: string): Promise<string[] | null> => {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => null);
  return entries === null
    ? null
    : entries
        .filter((entry) => !entry.isDirectory() && !isOsDotfile(entry.name))
        .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
        .sort();
};

/**
 * Fail-loud guard against a byline that is not the site's author.
 *
 * `renderOg` used to fall back to a hardcoded name that no caller ever
 * overrode, so a stranger's name sat on every social card of the site — in a
 * PNG, invisible to every HTML-level check, for months. The name of a person
 * belongs in exactly one file (`src/lib/seo/person.ts`); anything under the
 * OG folders that merely *looks* like a name is a regression until a human
 * adds it to OG_ALLOWED_LITERALS.
 */
export const assertOgAuthorNames = async (
  roots: ReadonlyArray<string> = OG_SOURCE_ROOTS,
  cwd: string = process.cwd(),
): Promise<string[]> => {
  const issues: string[] = [];

  for (const root of roots) {
    const dir = resolve(cwd, root);
    const files = await ogSourceFiles(dir);
    if (files === null) {
      issues.push(`OG source folder is unreadable: ${root}`);
      continue;
    }

    for (const name of files) {
      const label = `${root}/${name.split(sep).join("/")}`;
      if (!OG_SCANNED_EXTENSIONS.has(extname(name))) {
        issues.push(
          `${label}: unscanned file type under an OG root. The byline guard only reads ` +
            `${[...OG_SCANNED_EXTENSIONS].join(", ")} string literals, so a name in this file would ` +
            `pass silently — extend the scanner in scripts/verify-seo-build.ts before adding it.`,
        );
        continue;
      }

      const source = await readFile(join(dir, name), "utf8");

      for (const match of source.matchAll(STRING_LITERAL)) {
        const literal = match[1] ?? match[2] ?? match[3] ?? "";
        if (OG_ALLOWED_LITERALS.has(literal)) continue;
        const nameLike = NAME_LIKE.exec(literal);
        if (nameLike === null) continue;

        issues.push(
          literal.includes(person.name) || literal.includes(person.alternateName)
            ? `${label}: author name copied into a string literal (${JSON.stringify(literal)}). ` +
                `Import person from ~/lib/seo/person instead — a copy drifts silently.`
            : `${label}: string literal ${JSON.stringify(literal)} reads as a person name ` +
                `(${JSON.stringify(nameLike[0])}). OG bylines come from person.name in ` +
                `src/lib/seo/person.ts; if this is not a name, add it to OG_ALLOWED_LITERALS.`,
        );
      }
    }
  }

  const byline = await readFile(resolve(cwd, OG_BYLINE_SOURCE), "utf8").catch(() => null);
  if (byline === null) {
    issues.push(`missing ${OG_BYLINE_SOURCE}`);
  } else if (!PERSON_MODULE.test(byline) || !/\bperson\.name\b/.test(byline)) {
    issues.push(
      `${OG_BYLINE_SOURCE}: the byline no longer falls back to person.name imported from ` +
        `~/lib/seo/person, so cards can render an author the site never claims.`,
    );
  }

  return issues;
};

const runBuild = async (): Promise<number> => {
  // Static source guard first: it reads no build output, so a hardcoded
  // byline is reported in a second instead of after a full `pnpm build`.
  const nameIssues = await assertOgAuthorNames();
  for (const issue of nameIssues) {
    console.error(`[seo-build] og byline: ${issue}`);
  }
  if (nameIssues.length > 0) return 1;

  let output = "";
  const child = spawn("pnpm", ["build"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    process.stderr.write(chunk);
  });

  const exitCode = await new Promise<number>((resolveExit) => {
    child.once("error", (error) => {
      console.error(`[seo-build] Failed to start pnpm build: ${error.message}`);
      resolveExit(1);
    });
    child.once("close", (code) => resolveExit(code ?? 1));
  });

  const diagnostics = diagnoseSeoBuildOutput(output);
  for (const { label, block } of diagnostics) {
    console.error(`[seo-build] ${label}:\n${block}\n`);
  }

  if (exitCode !== 0) return exitCode;
  if (diagnostics.length > 0) return 1;

  const fontIssues = await assertFontPreloadsResolved();
  for (const issue of fontIssues) {
    console.error(`[seo-build] font preload: ${issue}`);
  }

  // Both output guards run on every green build: one `pnpm build` costs
  // minutes, so a run must report everything it can see, not the first thing.
  const graphIssues = await assertNoDanglingGraphRefs();
  for (const issue of graphIssues) {
    console.error(`[seo-build] dangling graph ref: ${issue}`);
  }

  return fontIssues.length === 0 && graphIssues.length === 0 ? 0 : 1;
};

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  process.exitCode = await runBuild();
}
