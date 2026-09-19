import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A post page makes two claims about itself: one to a reader, in the visible
 * markup, and one to a crawler, in the JSON-LD graph. These tests assert the
 * rules that keep the two from drifting apart:
 *
 *   - every `@id` the BlogPosting points at is a node the same page emits
 *     (a reference to a node nobody publishes is the same as no reference);
 *   - one article is written by one person, so the page describes exactly one
 *     Person across JSON-LD and microdata taken together;
 *   - the breadcrumb trail a reader sees is the BreadcrumbList, item for item;
 *   - the byline a reader sees is what `article:author` tells a machine.
 *
 * They read built pages, so `pnpm build` has to have run: only the build
 * proves a layout emits what its source says it does.
 */

const DIST = join(process.cwd(), "dist/client");

interface BuiltPost {
  readonly locale: "ru" | "en";
  readonly route: string;
  readonly file: string;
}

const blogDir = (locale: "ru" | "en"): string => join(DIST, locale === "ru" ? "blog" : "en/blog");

/** Post pages the build produced for one locale, empty when there is no build. */
const builtPostsOf = (locale: "ru" | "en"): readonly BuiltPost[] => {
  const dir = blogDir(locale);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "index.html")))
    .map((entry) => ({
      locale,
      route: `${locale === "ru" ? "" : "/en"}/blog/${entry.name}/`,
      file: join(dir, entry.name, "index.html"),
    }));
};

const builtPosts: readonly BuiltPost[] = [...builtPostsOf("ru"), ...builtPostsOf("en")];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `@graph` of the page's single JSON-LD block. */
const graphOf = (html: string): ReadonlyArray<Readonly<Record<string, unknown>>> => {
  const raw = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (raw === undefined) throw new Error("page has no application/ld+json block");
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || !Array.isArray(parsed["@graph"])) {
    throw new Error("JSON-LD block is not a @graph document");
  }
  return parsed["@graph"].filter(isRecord);
};

const typesOf = (node: Readonly<Record<string, unknown>>): ReadonlyArray<string> => {
  const type = node["@type"];
  if (typeof type === "string") return [type];
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === "string");
  return [];
};

const nodeOfType = (
  graph: ReadonlyArray<Readonly<Record<string, unknown>>>,
  type: string,
): Readonly<Record<string, unknown>> => {
  const node = graph.find((candidate) => typesOf(candidate).includes(type));
  if (node === undefined) throw new Error(`no ${type} node in the page graph`);
  return node;
};

/** Every `@id` reachable from a value, ignoring the `@id` that names a node. */
const referencedIds = (value: unknown): ReadonlyArray<string> => {
  if (Array.isArray(value)) return value.flatMap(referencedIds);
  if (!isRecord(value)) return [];
  const own = typeof value["@id"] === "string" ? [value["@id"]] : [];
  const nested = Object.entries(value)
    .filter(([key]) => key !== "@id")
    .flatMap(([, child]) => referencedIds(child));
  return [...own, ...nested];
};

/** References a node makes to other nodes — its own `@id` is identity, not a link. */
const outboundIds = (node: Readonly<Record<string, unknown>>): ReadonlyArray<string> =>
  Object.entries(node)
    .filter(([key]) => key !== "@id")
    .flatMap(([, value]) => referencedIds(value));

/** Objects of a given `@type` anywhere in the graph, nested ones included. */
const countTyped = (value: unknown, type: string): number => {
  if (Array.isArray(value)) return value.reduce<number>((sum, x) => sum + countTyped(x, type), 0);
  if (!isRecord(value)) return 0;
  const here = typesOf(value).includes(type) ? 1 : 0;
  return Object.values(value).reduce<number>((sum, x) => sum + countTyped(x, type), here);
};

/** `&amp;` goes last, or `&amp;lt;` would decode twice. */
const decodeEntities = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/g, "&");

const text = (markup: string): string =>
  decodeEntities(markup.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** Visible labels of the breadcrumb trail, in document order. Separators are aria-hidden. */
const visibleCrumbs = (html: string): ReadonlyArray<string> => {
  const nav = /<nav\b[^>]*class="breadcrumbs"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1];
  if (nav === undefined) return [];
  return [
    ...nav.matchAll(/<(a|span)\b[^>]*class="breadcrumbs__(?:link|current)"[^>]*>([\s\S]*?)<\/\1>/g),
  ].map((match) => text(match[2] ?? ""));
};

/** Names of the BreadcrumbList items, in `position` order. */
const crumbNames = (
  graph: ReadonlyArray<Readonly<Record<string, unknown>>>,
): ReadonlyArray<string> => {
  const list = nodeOfType(graph, "BreadcrumbList")["itemListElement"];
  if (!Array.isArray(list)) throw new Error("BreadcrumbList has no itemListElement");
  return list
    .filter(isRecord)
    .slice()
    .sort((a, b) => Number(a["position"] ?? 0) - Number(b["position"] ?? 0))
    .map((item) => String(item["name"] ?? ""));
};

const metaContent = (html: string, property: string): string | undefined => {
  const tag = new RegExp(`<meta\\b[^>]*\\bproperty=["']${property}["'][^>]*>`, "i").exec(html)?.[0];
  const content = tag === undefined ? null : /\bcontent=(?:"([^"]*)"|'([^']*)')/i.exec(tag);
  const value = content?.[1] ?? content?.[2];
  return value === undefined ? undefined : decodeEntities(value);
};

const visibleByline = (html: string): string | undefined => {
  const anchor = /<a\b[^>]*class="post__byline-name"[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1];
  return anchor === undefined ? undefined : text(anchor);
};

describe("built post pages", () => {
  // it.each over an empty list would report zero tests and pass. Every
  // assertion below depends on this one having found pages in both locales.
  it("were built for both locales", () => {
    expect(
      builtPosts.map((post) => post.route),
      "no built posts under dist/client — run `pnpm build` first",
    ).not.toHaveLength(0);
    expect(new Set(builtPosts.map((post) => post.locale))).toEqual(new Set(["ru", "en"]));
  });

  it.each(builtPosts)("$route resolves every @id the BlogPosting points at", ({ file }) => {
    const graph = graphOf(readFileSync(file, "utf8"));
    const published = new Set(
      graph.map((node) => node["@id"]).filter((id): id is string => typeof id === "string"),
    );
    const blogPosting = nodeOfType(graph, "BlogPosting");
    const outbound = outboundIds(blogPosting);

    expect(outbound).not.toHaveLength(0);
    expect(outbound.filter((id) => !published.has(id))).toEqual([]);
    // The article's only link to its publication: it used to point at a Blog
    // node emitted on /blog/ alone, so on a post it resolved to nothing.
    expect(referencedIds(blogPosting["isPartOf"]).filter((id) => published.has(id))).toHaveLength(
      1,
    );
  });

  it.each(builtPosts)("$route describes exactly one Person", ({ file }) => {
    const html = readFileSync(file, "utf8");

    expect(countTyped(graphOf(html), "Person")).toBe(1);
    // A microdata Person next to the JSON-LD one is a second, anonymous author.
    expect(html).not.toMatch(/itemtype=["']?https?:\/\/schema\.org\/Person\b/i);
  });

  it.each(builtPosts)("$route shows the breadcrumb trail it marks up", ({ file }) => {
    const html = readFileSync(file, "utf8");
    const visible = visibleCrumbs(html);

    expect(visible).not.toHaveLength(0);
    expect(visible).toEqual(crumbNames(graphOf(html)));
  });

  it.each(builtPosts)("$route signs the article with the author it declares", ({ file }) => {
    const html = readFileSync(file, "utf8");
    const declared = metaContent(html, "article:author");

    expect(declared).toBeDefined();
    expect(visibleByline(html)).toBe(declared);
  });
});

// PostLayout computes the cover's origin and BaseLayout renders the hints: two
// files, so only the built page shows whether the hand-off works. The rule is
// stated on the page itself, with no list of posts or hosts: a cover fetched
// from another origin is announced in <head> before the parser reaches the
// <img>, and a page with no such cover announces nothing.
describe("post cover from another origin", () => {
  const SITE_ORIGIN = "https://artka.dev";

  /** Origin of the real cover when it is served from somewhere else, else null. */
  const thirdPartyCoverOrigin = (html: string): string | null => {
    const figure =
      /<figure\b[^>]*\bclass="[^"]*\bpost__cover\b[^"]*"[^>]*>([\s\S]*?)<\/figure>/.exec(html)?.[1];
    const src = figure === undefined ? undefined : /<img\b[^>]*\bsrc="([^"]+)"/.exec(figure)?.[1];
    if (src === undefined || !/^https?:\/\//.test(src)) return null;
    const origin = new URL(src).origin;
    return origin === SITE_ORIGIN ? null : origin;
  };

  const hintedOrigins = (html: string, rel: "preconnect" | "dns-prefetch"): readonly string[] =>
    [...html.matchAll(new RegExp(`<link\\b[^>]*\\brel="${rel}"[^>]*>`, "g"))].map(
      ([tag]) => /\bhref="([^"]+)"/.exec(tag)?.[1] ?? "",
    );

  it("has at least one such post to check, and at least one without", () => {
    const origins = builtPosts.map(({ file }) => thirdPartyCoverOrigin(readFileSync(file, "utf8")));
    expect(origins.filter((origin) => origin !== null).length).toBeGreaterThan(0);
    expect(origins.filter((origin) => origin === null).length).toBeGreaterThan(0);
  });

  it.each(builtPosts)("$route announces exactly the origin its cover needs", ({ file }) => {
    const html = readFileSync(file, "utf8");
    const expected = thirdPartyCoverOrigin(html);
    const wanted = expected === null ? [] : [expected];

    expect(hintedOrigins(html, "preconnect")).toEqual(wanted);
    expect(hintedOrigins(html, "dns-prefetch")).toEqual(wanted);
    if (expected !== null) {
      // A hint placed after the image it is for buys nothing.
      expect(html.indexOf('rel="preconnect"')).toBeLessThan(html.indexOf("post__cover"));
      expect(html.indexOf('rel="preconnect"')).toBeLessThan(html.indexOf("</head>"));
    }
  });
});
