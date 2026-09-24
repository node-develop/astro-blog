import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";
import { graphIds } from "~/lib/seo/nodes-global";
import { fetchWithTimeout } from "../support/production-server";

const origin = inject("siteOrigin");

/**
 * The site's main list of articles must exist in the markup, not only in the
 * cards a browser paints — that is what a language model reads when it decides
 * whether the blog is citable. Every assertion below is derived from the page
 * itself: no hard-coded slug, count or order lives here, so the suite keeps
 * meaning when posts are added, renamed or reordered.
 */

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue | undefined;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const graphOf = (html: string): JsonObject[] => {
  const blocks = [
    ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ].map((match) => JSON.parse(match[1]!) as JsonValue);
  const withGraph = blocks.filter((block) => isObject(block) && Array.isArray(block["@graph"]));
  expect(withGraph, "exactly one JSON-LD block with an @graph").toHaveLength(1);
  return (withGraph[0] as JsonObject)["@graph"] as JsonObject[];
};

const mainOf = (html: string): string => {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
  expect(main, "page renders a <main>").toBeTruthy();
  return main!;
};

/** Post links the page actually shows, deduped, in the order they appear. */
const postLinksInMain = (html: string, prefix: string): string[] => [
  ...new Set(
    [...mainOf(html).matchAll(/href="([^"]+)"/g)]
      .map((match) => match[1]!)
      .filter((href) => new RegExp(`^${prefix}/blog/[^/]+/$`).test(href)),
  ),
];

/** Walk every object in the graph, including nodes embedded inside nodes. */
const walk = (value: JsonValue | undefined, visit: (node: JsonObject) => void): void => {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!isObject(value)) return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
};

/** `{"@id": …}` and nothing else — a pointer, not a definition. */
const isBareReference = (node: JsonObject): boolean => {
  const keys = Object.keys(node);
  return keys.length === 1 && keys[0] === "@id";
};

const definedIds = (graph: JsonObject[]): Set<string> => {
  const ids = new Set<string>();
  walk(graph, (node) => {
    const id = node["@id"];
    if (typeof id === "string" && !isBareReference(node)) ids.add(id);
  });
  return ids;
};

const bareReferenceIds = (graph: JsonObject[]): string[] => {
  const ids: string[] = [];
  walk(graph, (node) => {
    if (isBareReference(node) && typeof node["@id"] === "string") ids.push(node["@id"]);
  });
  return ids;
};

/**
 * The one documented exception: site-global nodes of the OTHER locale. The RU
 * WebSite points at the EN one and back, and those nodes live in the other
 * language's documents by design.
 */
const otherLocaleGlobalIds = (locale: "ru" | "en"): ReadonlySet<string> =>
  new Set(
    locale === "ru" ? [graphIds.websiteEn, graphIds.blogEn] : [graphIds.websiteRu, graphIds.blogRu],
  );

/** Asserts rules (a)–(e) on one page; returns how many posts the page links. */
const assertListMatchesMarkup = (label: string, html: string, locale: "ru" | "en"): number => {
  const prefix = locale === "en" ? "/en" : "";
  const graph = graphOf(html);

  // (a) the graph contains an ItemList.
  const lists = graph.filter((node) => node["@type"] === "ItemList");
  expect(lists, `${label}: one ItemList in the graph`).toHaveLength(1);
  const list = lists[0]!;
  const elements = list["itemListElement"] as JsonObject[];

  const links = postLinksInMain(html, prefix);

  // (b) the list is exactly what the page shows, in the order it shows it.
  expect(
    elements.map((element) => new URL(element["url"] as string).pathname),
    `${label}: ItemList urls`,
  ).toEqual(links);
  expect(list["numberOfItems"], `${label}: numberOfItems`).toBe(links.length);

  // (c) positions run 1..n.
  expect(
    elements.map((element) => element["position"]),
    `${label}: positions`,
  ).toEqual(links.map((_, idx) => idx + 1));

  // Entries embed a minimal typed node, never a bare reference to a node that
  // lives on the post's own page.
  for (const element of elements) {
    const item = element["item"];
    expect(isObject(item) && !isBareReference(item), `${label}: entry embeds a node`).toBe(true);
    const node = item as JsonObject;
    expect(node["@id"], `${label}: entry @id`).toBe(`${element["url"] as string}#blogposting`);
    expect(node["@type"], `${label}: entry @type`).toBe("BlogPosting");
    expect(typeof node["headline"], `${label}: entry headline`).toBe("string");
  }

  // (d) the list is reachable: some other node of the same graph points at it.
  const listId = list["@id"] as string;
  const referrers = graph.filter(
    (node) => node !== list && bareReferenceIds([node]).includes(listId),
  );
  expect(referrers.length, `${label}: ItemList is referenced, not an orphan`).toBeGreaterThan(0);

  // (e) every bare reference resolves inside this page's graph, except the
  // site-global nodes of the other locale.
  const resolvable = definedIds(graph);
  const exempt = otherLocaleGlobalIds(locale);
  const dangling = [
    ...new Set(bareReferenceIds(graph).filter((id) => !resolvable.has(id) && !exempt.has(id))),
  ];
  expect(dangling, `${label}: dangling @id references`).toEqual([]);

  return links.length;
};

const distTagArchives = (locale: "ru" | "en"): ReadonlyArray<readonly [string, string]> => {
  const root = join(process.cwd(), "dist/client", locale === "en" ? "en/tags" : "tags");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(
      (entry) =>
        [
          `${locale === "en" ? "/en" : ""}/tags/${entry.name}/`,
          readFileSync(join(root, entry.name, "index.html"), "utf8"),
        ] as const,
    );
};

describe("the main list of articles is in the markup — server-rendered pages", () => {
  it.each([
    ["/", "ru"],
    ["/blog/", "ru"],
    ["/en/", "en"],
    ["/en/blog/", "en"],
  ] as const)("%s enumerates the posts it links", async (path, locale) => {
    const response = await fetchWithTimeout(`${origin}${path}`, {}, 10_000);
    expect(response.status, path).toBe(200);
    const listed = assertListMatchesMarkup(path, await response.text(), locale);
    // Fixture guard: the comparisons are vacuous on a page that links nothing,
    // and the home page and the blog index always list posts.
    expect(listed, `${path}: page links at least one post`).toBeGreaterThan(0);
  });
});

describe("the main list of articles is in the markup — built tag archives", () => {
  const archives = [...distTagArchives("ru"), ...distTagArchives("en")];

  // Fixture guard, on the run as a whole rather than per archive: a tag used
  // in one locale only yields an archive with the localized empty state in the
  // other, and there "no links, no entries" IS the rule holding. What must not
  // happen is a run where nothing is listed anywhere, or where only one-post
  // archives exist and the ORDER of the list is never exercised.
  it("covers archives that list posts, some of them more than one", () => {
    const linkCounts = archives.map(
      ([path, html]) => postLinksInMain(html, path.startsWith("/en/") ? "/en" : "").length,
    );
    expect(linkCounts.filter((count) => count > 0).length).toBeGreaterThan(archives.length / 2);
    expect(linkCounts.filter((count) => count > 1).length).toBeGreaterThan(1);
  });

  it.each(archives)("%s enumerates the posts it links", (path, html) => {
    assertListMatchesMarkup(path, html, path.startsWith("/en/") ? "en" : "ru");
  });
});
