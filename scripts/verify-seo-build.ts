import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

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

const runBuild = async (): Promise<number> => {
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
  return fontIssues.length === 0 ? 0 : 1;
};

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  process.exitCode = await runBuild();
}
