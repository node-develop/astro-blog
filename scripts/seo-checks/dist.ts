import { readFile, readdir } from "node:fs/promises";
import { join, sep } from "node:path";
import type { Element, Root } from "hast";
import { fromHtml } from "hast-util-from-html";
import { select, selectAll } from "hast-util-select";
import { CANONICAL_ORIGIN } from "../../src/lib/seo/url-policy";

/**
 * The build output, read once. Every check in this folder is a pure function of a `Dist`; this
 * module reads every page of the build once and parses each exactly once (the og PNG files are
 * read by `social.ts`, the snapshot comparison reads dist again in `verifyContentBuild`).
 * Imports from `src` are relative and never reach `astro:content`, so the checks run under tsx.
 */

export type Page = Readonly<{
  /** Path relative to the dist root, posix separators (`blog/x/index.html`). */
  file: string;
  /** Public route (`/blog/x/`; `/404.html` for a file that is not an `index.html`). */
  route: string;
  html: string;
  tree: Root;
}>;

export type Dist = Readonly<{
  root: string;
  pages: readonly Page[];
  /** Every file of the build, posix paths relative to the root. */
  files: ReadonlySet<string>;
  /** The sitemap documents by file name (`sitemap-index.xml`, `sitemap-ru.xml`, `sitemap-en.xml`). */
  xml: ReadonlyMap<string, string>;
}>;

export const SITEMAP_FILES = ["sitemap-index.xml", "sitemap-ru.xml", "sitemap-en.xml"] as const;

const toPosix = (path: string): string => path.split(sep).join("/");

export const routeOfFile = (file: string): string =>
  file === "index.html"
    ? "/"
    : file.endsWith("/index.html")
      ? `/${file.slice(0, -"index.html".length)}`
      : `/${file}`;

export const readDist = async (root: string): Promise<Dist> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => toPosix(join(entry.parentPath, entry.name).slice(root.length + 1)))
    .sort();

  const pages = await Promise.all(
    files
      .filter((file) => file.endsWith(".html"))
      .map(async (file): Promise<Page> => {
        const html = await readFile(join(root, file), "utf8");
        return { file, route: routeOfFile(file), html, tree: fromHtml(html) };
      }),
  );

  const xml = new Map<string, string>();
  for (const name of SITEMAP_FILES) {
    if (files.includes(name)) xml.set(name, await readFile(join(root, name), "utf8"));
  }

  return { root, pages, files: new Set(files), xml };
};

/** An attribute as a string. hast stores known attributes under camelCase property names. */
export const attr = (el: Element, name: string): string | undefined => {
  const wanted = name.toLowerCase().replaceAll("-", "");
  for (const [key, value] of Object.entries(el.properties)) {
    if (key.toLowerCase().replaceAll("-", "") !== wanted) continue;
    if (value === undefined || value === null || value === false) return undefined;
    if (value === true) return "";
    return Array.isArray(value) ? value.join(" ") : String(value);
  }
  return undefined;
};

export const hasClass = (el: Element, name: string): boolean => {
  const value = el.properties["className"];
  return Array.isArray(value) && value.map(String).includes(name);
};

export const textOf = (node: Root | Element): string =>
  node.children
    .map((child) =>
      child.type === "text" ? child.value : child.type === "element" ? textOf(child) : "",
    )
    .join("");

export const query = (page: Page, selector: string): Element | undefined =>
  select(selector, page.tree) ?? undefined;

export const queryAll = (page: Page, selector: string): readonly Element[] =>
  selectAll(selector, page.tree);

/** `content` of `<meta name=key>` or `<meta property=key>`, undefined when absent. */
export const meta = (page: Page, key: string): string | undefined => {
  const el = query(page, `meta[name="${key}"]`) ?? query(page, `meta[property="${key}"]`);
  return el === undefined ? undefined : attr(el, "content");
};

export const metaAll = (page: Page, key: string): readonly string[] =>
  [...queryAll(page, `meta[name="${key}"]`), ...queryAll(page, `meta[property="${key}"]`)].flatMap(
    (el) => attr(el, "content") ?? [],
  );

/** Hrefs of every `<link rel="canonical">`. */
export const canonicalsOf = (page: Page): readonly string[] =>
  queryAll(page, 'link[rel~="canonical"]').flatMap((el) => attr(el, "href") ?? []);

export type Alternate = Readonly<{ code: string; href: string }>;

/** The hreflang cluster of a page: `link[rel=alternate][hreflang]`, markdown twins excluded. */
export const hreflangCluster = (page: Page): readonly Alternate[] =>
  queryAll(page, 'link[rel~="alternate"][hreflang]')
    .filter((el) => attr(el, "type") !== "text/markdown")
    .map((el) => ({ code: attr(el, "hreflang") ?? "", href: attr(el, "href") ?? "" }));

/** Raw text of every `<script type="application/ld+json">`. */
export const jsonLdBlocks = (page: Page): readonly string[] =>
  queryAll(page, 'script[type="application/ld+json"]').map(textOf);

export const isIndexable = (page: Page): boolean =>
  !(meta(page, "robots") ?? "").toLowerCase().includes("noindex");

const POST_ROUTE = /^\/(?:en\/)?blog\/[^/]+\/$/;

export const isPostRoute = (route: string): boolean => POST_ROUTE.test(route);

export const localeOfRoute = (route: string): "ru" | "en" =>
  route === "/en" || route.startsWith("/en/") ? "en" : "ru";

export const absoluteUrl = (route: string): string => new URL(route, CANONICAL_ORIGIN).toString();
