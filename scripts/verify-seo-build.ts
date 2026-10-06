import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { person } from "../src/lib/seo/person";
import type { ExportSnapshot } from "../src/lib/content-api/contract";
import {
  checkSnapshot,
  readJson,
  readManifest,
  resolveSnapshotPath,
} from "../src/lib/content/snapshot";
import { verifyContentBuild } from "../src/lib/content/verify-build";
import { readDist } from "./seo-checks/dist";
import { checkDiagrams } from "./seo-checks/diagrams";
import { checkHreflang } from "./seo-checks/hreflang";
import { checkImages } from "./seo-checks/images";
import { checkJsonLd } from "./seo-checks/jsonld";
import { checkInternalLinks } from "./seo-checks/links";
import { staleExemptions } from "./seo-checks/on-demand";
import { checkSitemaps } from "./seo-checks/sitemap";
import { checkSocialMeta } from "./seo-checks/social";

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
 * inside an inline style on that page or an emitted CSS file.
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

  const inlineStyles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
    (match) => match[1] ?? "",
  );
  const styles = [...cssContents, ...inlineStyles];

  return preloadHrefs
    .filter((href) => !styles.some((css) => css.includes(href)))
    .map((href) => `font preload href not found in emitted or inline CSS: ${href}`);
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

/** Category of every finding `runDistChecks` can produce; the test holds this list to the wiring. */
export const DIST_CHECK_CATEGORIES = [
  "json-ld",
  "hreflang",
  "sitemap",
  "images",
  "social",
  "diagrams",
  "links",
  "on-demand",
  "content build",
] as const;

export type DistFinding = readonly [category: string, issue: string];

/**
 * Every check on the finished build, over one read of the pages of `dist/client`: the page checks of
 * `scripts/seo-checks/` and the comparison with the snapshot the build came from
 * (`verifyContentBuild`: revision marker, sitemap membership, hiddenFromList). Stale on-demand
 * exemptions are reported here, once, not by each check that consults the list.
 */
export const runDistChecks = async (
  root: string,
  snapshot: ExportSnapshot,
): Promise<readonly DistFinding[]> => {
  const dist = await readDist(root);
  const tag =
    (category: string) =>
    (issues: readonly string[]): readonly DistFinding[] =>
      issues.map((issue) => [category, issue] as const);
  return [
    ...tag("json-ld")(checkJsonLd(dist)),
    ...tag("hreflang")(checkHreflang(dist)),
    ...tag("sitemap")(checkSitemaps(dist)),
    ...tag("images")(checkImages(dist)),
    ...tag("social")(await checkSocialMeta(dist)),
    ...tag("diagrams")(checkDiagrams(dist)),
    ...tag("links")(checkInternalLinks(dist)),
    ...tag("on-demand")(staleExemptions(dist)),
    ...tag("content build")(await verifyContentBuild(snapshot, root)),
  ];
};

/** `[seo-build] <category>: <issue>`; a check that already names its rule is not prefixed twice. */
export const formatFinding = ([category, issue]: DistFinding): string =>
  `[seo-build] ${issue.startsWith(`${category}: `) ? issue : `${category}: ${issue}`}`;

const loadSnapshot = async (): Promise<ExportSnapshot> => {
  const path = resolveSnapshotPath(process.env, process.cwd());
  const { minArticles } = await readManifest(process.cwd());
  return checkSnapshot(await readJson(path), minArticles, path);
};

const fail = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

const runBuild = async (distOnly: boolean): Promise<number> => {
  // Static source guard first: it reads no build output, so a hardcoded
  // byline is reported in a second instead of after a full `pnpm build`.
  const nameIssues = await assertOgAuthorNames();
  for (const issue of nameIssues) {
    fail(`[seo-build] og byline: ${issue}`);
  }
  if (nameIssues.length > 0) return 1;

  if (!distOnly) {
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
        fail(`[seo-build] Failed to start pnpm build: ${error.message}`);
        resolveExit(1);
      });
      child.once("close", (code) => resolveExit(code ?? 1));
    });

    const diagnostics = diagnoseSeoBuildOutput(output);
    for (const { label, block } of diagnostics) {
      fail(`[seo-build] ${label}:\n${block}\n`);
    }

    if (exitCode !== 0) return exitCode;
    if (diagnostics.length > 0) return 1;
  }

  // The snapshot is loaded the way the build loaded it (CONTENT_SNAPSHOT or the fixture), so the
  // marker check compares the build with the file it was made from.
  const snapshot = await loadSnapshot();

  const fontIssues = await assertFontPreloadsResolved();
  for (const issue of fontIssues) {
    fail(`[seo-build] font preload: ${issue}`);
  }

  // Everything runs on every green build: one `pnpm build` costs minutes, so a run must
  // report everything it can see, not the first thing.
  const distReadable = await stat(DIST_CLIENT_DIR).then(
    (info) => info.isDirectory(),
    () => false,
  );
  if (!distReadable) {
    fail(`[seo-build] build output is unreadable: ${DIST_CLIENT_DIR}`);
    return 1;
  }
  const findings = await runDistChecks(DIST_CLIENT_DIR, snapshot);
  for (const finding of findings) {
    fail(formatFinding(finding));
  }

  return fontIssues.length === 0 && findings.length === 0 ? 0 : 1;
};

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  process.exitCode = await runBuild(process.argv.includes("--dist-only"));
}
