/**
 * Whole-build check on the social cards, run against `dist/client`.
 *
 * The audit found eight pages still serving the site-wide `/og-default.png`
 * placeholder long after per-page cards were introduced, and nothing in the
 * repo noticed: every page-level test asserted its own tag, so a page nobody
 * thought about kept the fallback for months. This suite therefore derives
 * its page list by walking the built output instead of naming pages, so a
 * route added tomorrow is covered the day it is built.
 *
 * Rules:
 *   1. no indexable page falls back to the placeholder;
 *   2. every og:image that points at this site resolves to a file the build
 *      actually produced;
 *   3. the RU and EN twin of a project do not share one card.
 *
 * Requires a build: `pnpm build` (or `pnpm verify:seo-build`) first.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { CANONICAL_ORIGIN } from "~/lib/seo/url-policy";

const DIST = join(process.cwd(), "dist", "client");
const PLACEHOLDER = "/og-default.png";

/**
 * Pages outside this task's ownership that are knowingly still on the
 * placeholder. Every entry names the page and why it is tolerated, and the
 * suite fails on a stale entry, so the list cannot quietly outlive the
 * problem. Empty is the correct state.
 */
const PLACEHOLDER_ALLOWLIST: ReadonlyMap<string, string> = new Map<string, string>([]);

interface BuiltPage {
  /** Path relative to dist/client, with forward slashes. */
  readonly route: string;
  readonly ogImage: string | null;
  readonly indexable: boolean;
}

const htmlFilesUnder = (dir: string, found: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) htmlFilesUnder(full, found);
    else if (entry.name.endsWith(".html")) found.push(full);
  }
  return found;
};

const metaContent = (html: string, attribute: string, value: string): string | null => {
  const tag = new RegExp(`<meta[^>]*\\b${attribute}="${value}"[^>]*>`, "i").exec(html)?.[0];
  return tag ? (/\bcontent="([^"]*)"/i.exec(tag)?.[1] ?? null) : null;
};

const readPages = (): ReadonlyArray<BuiltPage> => {
  if (!existsSync(DIST)) {
    throw new Error(
      `[og-card-coverage] ${DIST} is missing. Run "pnpm build" before this suite — it checks ` +
        `the built output, not the sources.`,
    );
  }
  return htmlFilesUnder(DIST).map((file) => {
    const html = readFileSync(file, "utf8");
    return {
      route: relative(DIST, file).split(sep).join("/"),
      ogImage: metaContent(html, "property", "og:image"),
      indexable: !(metaContent(html, "name", "robots") ?? "").includes("noindex"),
    };
  });
};

const pages = readPages();

/** Project slug → its built page, per locale. */
const projectPages = (prefix: string): ReadonlyMap<string, BuiltPage> =>
  new Map(
    pages
      .filter((p) => p.route.startsWith(prefix) && p.route !== `${prefix}index.html`)
      .map((p) => [p.route.slice(prefix.length).replace(/\/index\.html$/, ""), p] as const),
  );

describe("built OG cards", () => {
  it("built enough pages to be worth checking", () => {
    // Guard against a stale, partial or empty dist/ quietly turning every
    // rule below into a vacuous pass.
    expect(pages.length).toBeGreaterThan(50);
    expect(pages.every((p) => p.ogImage !== null)).toBe(true);
  });

  it("serves no indexable page the placeholder card", () => {
    const onPlaceholder = pages
      .filter((p) => p.indexable && (p.ogImage ?? "").includes(PLACEHOLDER))
      .map((p) => p.route);

    expect(onPlaceholder.filter((route) => !PLACEHOLDER_ALLOWLIST.has(route))).toEqual([]);
    // A tolerated page that has since been fixed must leave the list.
    expect([...PLACEHOLDER_ALLOWLIST.keys()].filter((r) => !onPlaceholder.includes(r))).toEqual([]);
  });

  it("points every own-site card at a file the build produced", () => {
    const broken = pages
      .filter((page) => {
        const src = page.ogImage;
        if (src === null) return false;
        const url = new URL(src, CANONICAL_ORIGIN);
        if (url.origin !== new URL(CANONICAL_ORIGIN).origin) return false;
        const file = join(DIST, decodeURIComponent(url.pathname).replace(/^\//, ""));
        return !existsSync(file);
      })
      .map((page) => `${page.route} -> ${page.ogImage}`);

    expect(broken).toEqual([]);
  });

  it("gives the two locales of a project different cards", () => {
    const ru = projectPages("projects/");
    const en = projectPages("en/projects/");
    const twins = [...ru.keys()].filter((slug) => en.has(slug));

    expect(twins.length).toBeGreaterThan(0);
    const shared = twins.filter((slug) => ru.get(slug)!.ogImage === en.get(slug)!.ogImage);
    expect(shared).toEqual([]);
  });
});
