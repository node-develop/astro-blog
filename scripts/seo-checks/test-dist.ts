import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { getCounterpart } from "../../src/lib/i18n/paths";
import { safeJsonLd } from "../../src/lib/seo/json-ld";
import { buildBlogNode } from "../../src/lib/seo/nodes-global";
import {
  buildBlogPostingNode,
  buildBreadcrumbsNode,
  buildWebPageNode,
} from "../../src/lib/seo/nodes-page";
import { buildGraph, type GraphNode } from "../../src/lib/seo/schema";
import { readDist, type Dist } from "./dist";

/**
 * Test support, not a test: a synthetic `dist/client` that satisfies EVERY check, built from the
 * real graph builders. Each `*.test.ts` starts from `validFiles()` (and asserts the check is
 * silent on it), applies one defect with `edit`/`remove`, and asserts the check now speaks. A
 * negative test therefore proves the defect, and nothing else, is what turned the check red.
 */

export type Files = Readonly<Record<string, string | Uint8Array>>;
type Lang = "ru" | "en";

const ORIGIN = "https://artka.dev";
const tempRoots: string[] = [];

export const png = (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .png()
    .toBuffer();

/** Writes the files under a fresh temp directory and returns it; `disposeDists` removes them all. */
export const writeDist = async (files: Files): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "seo-checks-"));
  tempRoots.push(root);
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return root;
};

export const disposeDists = async (): Promise<void> => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
};

export const distFrom = async (files: Files): Promise<Dist> => readDist(await writeDist(files));

export const edit = (files: Files, file: string, change: (content: string) => string): Files => {
  const current = files[file];
  if (typeof current !== "string") throw new Error(`test-dist: ${file} is not a text file`);
  const next = change(current);
  if (next === current) throw new Error(`test-dist: the edit of ${file} changed nothing`);
  return { ...files, [file]: next };
};

/** Rewrites the `@graph` of the page's JSON-LD block. */
export const editGraph = (
  files: Files,
  file: string,
  change: (graph: Array<Record<string, unknown>>) => unknown[],
): Files =>
  edit(files, file, (html) =>
    html.replace(
      /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/,
      (_match, open: string, json: string, close: string) =>
        `${open}${safeJsonLd({
          "@context": "https://schema.org",
          "@graph": change(
            (JSON.parse(json) as { "@graph": Array<Record<string, unknown>> })["@graph"],
          ),
        })}${close}`,
    ),
  );

export const remove = (files: Files, file: string): Files => {
  if (!(file in files)) throw new Error(`test-dist: ${file} is not in the dist`);
  return Object.fromEntries(Object.entries(files).filter(([name]) => name !== file));
};

const fileOfRoute = (route: string): string => `${route.replace(/^\//, "")}index.html`;
const stemOf = (route: string): string => route.replace(/^\/|\/$/g, "").replaceAll("/", "-");
const urlOf = (route: string): string => `${ORIGIN}${route}`;
const langOf = (route: string): Lang => (route.startsWith("/en/") ? "en" : "ru");

/** The cluster a page with a twin declares: own language, the twin, x-default at the RU page. */
export const standardCluster = (route: string): ReadonlyArray<readonly [string, string]> => {
  const lang = langOf(route);
  const twin = getCounterpart(route, lang);
  const ru = lang === "ru" ? route : twin;
  const en = lang === "en" ? route : twin;
  return [
    ["ru", urlOf(ru)],
    ["en", urlOf(en)],
    ["x-default", urlOf(ru)],
  ];
};

export const ogImagePath = (route: string): string => `/og/${stemOf(route) || "home"}.png`;

export const DIAGRAM_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><title>Data flow</title><rect width="100" height="50"/></svg>';
export const DIAGRAM_SRC = `data:image/svg+xml,${encodeURIComponent(DIAGRAM_SVG)}`;

export const diagramFigure = (lang: Lang): string =>
  `<figure class="diagram"><div class="diagram__canvas" tabindex="0" role="group" aria-labelledby="diagram-1-caption">` +
  `<img alt="How data flows" height="50" id="mermaid-0" src="${DIAGRAM_SRC}" width="100.5" class="diagram__img--light">` +
  `<img alt="How data flows" height="50" src="${DIAGRAM_SRC}" width="100.5" class="diagram__img--dark"></div>` +
  `<figcaption id="diagram-1-caption"><span class="diagram__num">${lang === "ru" ? "Схема" : "Figure"} 1.</span> Data flow</figcaption></figure>`;

export type PageOptions = Readonly<{
  route: string;
  noindex?: boolean;
  /** `false`: no cluster. Default: the standard cluster of the route. */
  cluster?: ReadonlyArray<readonly [string, string]> | false;
  ogImage?: string;
  ogSize?: readonly [number, number];
  robots?: string;
  graphNodes?: readonly GraphNode[];
  body?: string;
  /** Raw head markup appended after everything else. */
  head?: string;
  /** Attributes of `<body>` (`data-content-revision` on a post). */
  bodyAttrs?: string;
}>;

const clusterLinks = (cluster: ReadonlyArray<readonly [string, string]>): string =>
  cluster
    .map(([code, href]) => `<link rel="alternate" hreflang="${code}" href="${href}">`)
    .join("");

const pageHtml = (options: PageOptions): string => {
  const lang = langOf(options.route);
  const canonical = urlOf(options.route);
  const cluster = options.cluster === undefined ? standardCluster(options.route) : options.cluster;
  const nodes = options.graphNodes ?? [
    buildWebPageNode({
      locale: lang,
      canonical,
      name: `Page ${options.route}`,
      description: "A page of the synthetic build",
    }) as GraphNode,
  ];
  const robots = options.robots ?? (options.noindex ? "noindex,follow" : "max-image-preview:large");
  const [width, height] = options.ogSize ?? [1200, 630];
  const image = options.ogImage ?? urlOf(ogImagePath(options.route));
  return (
    `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>Page ${options.route}</title>` +
    `<meta name="robots" content="${robots}"><link rel="canonical" href="${canonical}">` +
    (cluster === false ? "" : clusterLinks(cluster)) +
    `<meta property="og:image" content="${image}"><meta property="og:image:width" content="${width}">` +
    `<meta property="og:image:height" content="${height}">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<script type="application/ld+json">${safeJsonLd(buildGraph({ locale: lang, extraNodes: nodes }))}</script>` +
    `${options.head ?? ""}</head><body${options.bodyAttrs ? ` ${options.bodyAttrs}` : ""}><main><article class="prose">` +
    `${options.body ?? '<p>Text with a <a href="/about/">link</a>.</p>'}</article></main></body></html>`
  );
};

export const plainPage = (options: PageOptions): string => pageHtml(options);

/** The revision each language of the synthetic post carries, as `data-content-revision`. */
export const POST_REVISIONS: Readonly<Record<Lang, string>> = {
  ru: "0d7bb1d4-4f0a-4b38-86f5-2c4cb9b6a4e1",
  en: "0d7bb1d4-4f0a-4b38-86f5-2c4cb9b6a4e2",
};

export const POST_DATES = {
  published: new Date("2026-01-02T00:00:00Z"),
  modified: new Date("2026-02-03T00:00:00Z"),
} as const;

/** A post page: BlogPosting, Blog, WebPage and BreadcrumbList in one graph, an uploaded image in the body. */
export const postPage = (options: PageOptions): string => {
  const lang = langOf(options.route);
  const canonical = urlOf(options.route);
  return pageHtml({
    bodyAttrs: `data-content-revision="${POST_REVISIONS[lang]}"`,
    body:
      '<p>Read <a href="/blog/">the blog</a>.</p>' +
      '<img src="/uploads/a.webp" alt="A screenshot" width="800" height="600">',
    graphNodes: [
      buildBlogNode(lang) as GraphNode,
      buildBlogPostingNode({
        locale: lang,
        canonical,
        title: `Post ${options.route}`,
        description: "A post of the synthetic build",
        pubDate: POST_DATES.published,
        updatedDate: POST_DATES.modified,
        image: urlOf(ogImagePath(options.route)),
        keywords: ["a"],
        articleBody: "Body text",
        wordCount: 2,
      }) as GraphNode,
      buildWebPageNode({
        locale: lang,
        canonical,
        name: `Post ${options.route}`,
        description: "A post of the synthetic build",
      }) as GraphNode,
      buildBreadcrumbsNode({
        canonical,
        items: [
          { name: "Home", href: urlOf(lang === "ru" ? "/" : "/en/") },
          { name: "Blog", href: urlOf(lang === "ru" ? "/blog/" : "/en/blog/") },
          { name: `Post ${options.route}` },
        ],
      }) as GraphNode,
    ],
    ...options,
  });
};

export type SitemapEntry = Readonly<{
  loc: string;
  lastmod?: string;
  cluster?: ReadonlyArray<readonly [string, string]>;
}>;

export const sitemap = (entries: readonly SitemapEntry[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
  entries
    .map(
      ({ loc, lastmod, cluster = [] }) =>
        `<url><loc>${loc}</loc>${cluster
          .map(([code, href]) => `<xhtml:link rel="alternate" hreflang="${code}" href="${href}" />`)
          .join("")}${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`,
    )
    .join("\n") +
  "\n</urlset>";

export const sitemapIndex = (locs: readonly string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  locs
    .map((loc) => `<sitemap><loc>${loc}</loc><lastmod>2026-02-03</lastmod></sitemap>`)
    .join("\n") +
  "\n</sitemapindex>";

const ROUTE_PAIRS = {
  plain: ["/about/", "/en/about/"],
  post: ["/blog/hello/", "/en/blog/hello/"],
  lesson: ["/courses/guide/01-intro/", "/en/courses/guide/01-intro/"],
} as const;

export const ROUTES = ROUTE_PAIRS;

/**
 * A build every check accepts: an about page, a post and a lesson (with a diagram) in both
 * languages, their og cards, three sitemaps, and links to on-demand routes and uploads.
 */
export const validFiles = async (): Promise<Files> => {
  const card = await png(1200, 630);
  const pages: Record<string, string> = {};
  const locs = { ru: [] as SitemapEntry[], en: [] as SitemapEntry[] };
  const cards: Record<string, Uint8Array> = {};

  for (const [kind, routes] of Object.entries(ROUTE_PAIRS)) {
    for (const route of routes) {
      const lang = langOf(route);
      const build = kind === "post" ? postPage : plainPage;
      pages[fileOfRoute(route)] = build({
        route,
        ...(kind === "lesson" ? { body: `<p>Lesson.</p>${diagramFigure(lang)}` } : {}),
      });
      cards[ogImagePath(route).slice(1)] = card;
      locs[lang].push({
        loc: urlOf(route),
        cluster: standardCluster(route),
        ...(kind === "post" ? { lastmod: POST_DATES.modified.toISOString().slice(0, 10) } : {}),
      });
    }
  }
  for (const route of ["/", "/blog/"]) {
    locs.ru.push({ loc: urlOf(route), cluster: standardCluster(route) });
    locs.en.push({
      loc: urlOf(getCounterpart(route, "ru")),
      cluster: standardCluster(getCounterpart(route, "ru")),
    });
  }

  return {
    ...pages,
    ...cards,
    "sitemap-index.xml": sitemapIndex([urlOf("/sitemap-ru.xml"), urlOf("/sitemap-en.xml")]),
    "sitemap-ru.xml": sitemap(locs.ru),
    "sitemap-en.xml": sitemap(locs.en),
  };
};
