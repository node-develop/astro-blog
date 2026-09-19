import { graphIds, websiteId, type Locale } from "./nodes-global";

/**
 * Dangling-reference checker for the one JSON-LD `@graph` a page emits.
 *
 * Two defects lived here unnoticed for months, both invisible to every
 * existing check: `BlogPosting.isPartOf` on every post pointed at a `Blog`
 * node the post page never emitted, and `CollectionPage.hasPart` on the
 * portfolio pointed at nodes that live on the project pages. The markup
 * parsed, validated and rendered fine — it just resolved to nothing.
 *
 * THE RULE: every bare reference must resolve to a node defined in the SAME
 * page's graph. The only exception is a site-global node of the OTHER locale
 * (see `crossLocaleGlobalIds`). A list that has to point at entities described
 * on other pages must embed a minimal typed node under the same `@id` instead
 * of a bare reference — the way `hasPart` does in `nodes-projects.ts`.
 *
 * Pure data in, pure data out: the build guard feeds it pages from `dist`, and
 * the production smoke test feeds it pages fetched from the running server
 * (`/`, `/blog/` and their EN twins are rendered on demand and never reach
 * `dist`, so they can only be checked that way).
 */

/** A bare `{"@id": …}` reference and where in the page graph it sits. */
export interface GraphRef {
  /** Path from the top-level node, e.g. `BlogPosting.isPartOf`, `Blog.blogPost[2]`. */
  readonly path: string;
  readonly id: string;
}

export interface GraphRefsInput {
  /** The `@graph` array of ONE page, already parsed from its JSON-LD block. */
  readonly graph: ReadonlyArray<unknown>;
  readonly locale: Locale;
}

const blogId = (locale: Locale): string => (locale === "ru" ? graphIds.blogRu : graphIds.blogEn);

/**
 * Nodes that belong to one locale's documents: the `WebSite` and the `Blog`
 * of that language. `Person` and `Organization` are deliberately NOT here —
 * they carry no locale and `buildGraph` puts them on every page, so a page
 * that references one without defining it is broken, not excused.
 */
const siteGlobalIds = (locale: Locale): ReadonlyArray<string> => [
  websiteId(locale),
  blogId(locale),
];

const otherLocale = (locale: Locale): Locale => (locale === "ru" ? "en" : "ru");

/**
 * The one allowed dangling reference: a site-global node of the other locale,
 * such as `https://artka.dev/#website-en` linked from a Russian page through
 * `workTranslation`. By design that node is defined in the other language's
 * documents, so this page cannot resolve it and must not be asked to.
 *
 * Derived from `nodes-global`, never from copied URLs: renaming an id there
 * moves this exception with it.
 */
export const crossLocaleGlobalIds = (locale: Locale): ReadonlySet<string> => {
  const own = new Set(siteGlobalIds(locale));
  return new Set(siteGlobalIds(otherLocale(locale)).filter((id) => !own.has(id)));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The node list of one parsed `application/ld+json` block. Accepts the shape
 * `buildGraph` emits (`{"@context", "@graph": [...]}`), a bare array and a
 * single bare node, so a page that grows a second block is still checked
 * instead of silently skipped.
 */
export const graphNodesOf = (parsed: unknown): ReadonlyArray<unknown> => {
  if (Array.isArray(parsed)) return parsed;
  if (!isRecord(parsed)) return [];
  const graph = parsed["@graph"];
  return Array.isArray(graph) ? graph : [parsed];
};

/**
 * The id of a BARE reference: an object whose ONLY key is `@id`. An object
 * carrying `@id` plus anything else is a node definition — nested or not —
 * and defines that id for the whole page.
 */
const bareRefId = (record: Record<string, unknown>): string | null => {
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "@id") return null;
  const id = record["@id"];
  return typeof id === "string" ? id : null;
};

type NodeVisitor = (record: Record<string, unknown>, path: string) => void;

const walk = (value: unknown, path: string, visit: NodeVisitor): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
    return;
  }
  if (!isRecord(value)) return;
  visit(value, path);
  for (const [key, child] of Object.entries(value)) {
    walk(child, `${path}.${key}`, visit);
  }
};

/** `@type` names the node in the report; an untyped entry falls back to its slot. */
const rootPath = (node: unknown, index: number): string => {
  if (isRecord(node)) {
    const type = node["@type"];
    if (typeof type === "string") return type;
    if (Array.isArray(type)) {
      const first = type.find((entry): entry is string => typeof entry === "string");
      if (first !== undefined) return first;
    }
  }
  return `@graph[${index}]`;
};

/**
 * Every bare reference in this page's graph that resolves to nothing, in
 * document order. An empty result means the graph is closed over itself.
 */
export const findDanglingGraphRefs = (input: GraphRefsInput): ReadonlyArray<GraphRef> => {
  const defined = new Set<string>();
  const references: GraphRef[] = [];

  // One pass collects both: a definition may appear after the reference to it,
  // so nothing is decided until the whole graph has been read.
  input.graph.forEach((node, index) => {
    walk(node, rootPath(node, index), (record, path) => {
      const bare = bareRefId(record);
      if (bare !== null) {
        references.push({ path, id: bare });
        return;
      }
      const id = record["@id"];
      if (typeof id === "string") defined.add(id);
    });
  });

  const allowed = crossLocaleGlobalIds(input.locale);
  return references.filter(({ id }) => !defined.has(id) && !allowed.has(id));
};
