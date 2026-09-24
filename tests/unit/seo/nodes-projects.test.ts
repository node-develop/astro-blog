import { describe, expect, it } from "vitest";
import { buildCollectionPageNode, buildCreativeWorkNode } from "~/lib/seo/nodes-projects";
import { buildBreadcrumbsNode, buildWebPageNode } from "~/lib/seo/nodes-page";
import { buildGraph, type GraphNode } from "~/lib/seo/schema";
import { graphIds } from "~/lib/seo/nodes-global";

/**
 * The RU and EN WebSite nodes deliberately point at each other
 * (workTranslation / translationOfWork) and only one of the pair is ever
 * emitted on a page. That is a cross-document reference by design, so it is
 * the one dangling `@id` the traversability check tolerates.
 */
const CROSS_DOCUMENT_IDS: ReadonlySet<string> = new Set([graphIds.websiteRu, graphIds.websiteEn]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `@id`s the graph actually defines: a node carries both `@type` and `@id`. */
const definedIds = (value: unknown, found: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) definedIds(item, found);
    return found;
  }
  if (!isRecord(value)) return found;
  const id = value["@id"];
  if (typeof id === "string" && typeof value["@type"] === "string") found.add(id);
  for (const nested of Object.values(value)) definedIds(nested, found);
  return found;
};

/** Bare `{"@id": "…"}` objects — a pure reference, with nothing else in them. */
const referencedIds = (value: unknown, found: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) referencedIds(item, found);
    return found;
  }
  if (!isRecord(value)) return found;
  const keys = Object.keys(value);
  const id = value["@id"];
  if (keys.length === 1 && typeof id === "string") found.add(id);
  for (const nested of Object.values(value)) referencedIds(nested, found);
  return found;
};

const danglingIds = (graph: unknown): string[] => {
  const defined = definedIds(graph);
  return [...referencedIds(graph)].filter((id) => !defined.has(id) && !CROSS_DOCUMENT_IDS.has(id));
};

const CANONICAL = "https://artka.dev/projects";

const collectionInput = {
  locale: "ru" as const,
  canonical: CANONICAL,
  name: "Проекты",
  description: "Портфолио",
  items: [
    { url: "https://artka.dev/projects/foo", name: "Foo" },
    { url: "https://artka.dev/projects/bar", name: "Bar" },
  ],
  breadcrumbId: `${CANONICAL}#breadcrumbs`,
};

describe("buildCollectionPageNode", () => {
  it("emits CollectionPage referencing Person via author", () => {
    const node = buildCollectionPageNode(collectionInput);
    expect(node["@type"]).toBe("CollectionPage");
    expect(node["@id"]).toBe("https://artka.dev/projects#collection");
    expect(node.author).toEqual({ "@id": graphIds.person });
    expect(node.inLanguage).toBe("ru-RU");
  });

  it("points breadcrumb at the BreadcrumbList emitted on the same page", () => {
    const breadcrumbs = buildBreadcrumbsNode({
      canonical: CANONICAL,
      items: [{ name: "Главная", href: "https://artka.dev/" }, { name: "Проекты" }],
    });
    const node = buildCollectionPageNode({
      ...collectionInput,
      breadcrumbId: breadcrumbs["@id"],
    });

    expect(node.breadcrumb).toEqual({ "@id": breadcrumbs["@id"] });
  });

  it("defines every listed project instead of referencing an absent node", () => {
    const node = buildCollectionPageNode(collectionInput);

    // Each part carries its own @type/@id/url/name, so the reference resolves
    // in this page's graph — a bare {"@id"} would name a node that only the
    // project page emits.
    expect(node.hasPart).toEqual([
      {
        "@type": "CreativeWork",
        "@id": "https://artka.dev/projects/foo#creativework",
        url: "https://artka.dev/projects/foo",
        name: "Foo",
      },
      {
        "@type": "CreativeWork",
        "@id": "https://artka.dev/projects/bar#creativework",
        url: "https://artka.dev/projects/bar",
        name: "Bar",
      },
    ]);
  });

  it("uses en-US for en locale", () => {
    expect(
      buildCollectionPageNode({
        ...collectionInput,
        locale: "en",
        canonical: "https://artka.dev/en/projects",
        items: [],
        breadcrumbId: "https://artka.dev/en/projects#breadcrumbs",
      }).inLanguage,
    ).toBe("en-US");
  });
});

describe("buildCreativeWorkNode", () => {
  const base = {
    locale: "ru" as const,
    canonical: "https://artka.dev/projects/x",
    name: "X",
    description: "desc",
    role: "Solo",
    datePublished: new Date("2026-04-01T00:00:00Z"),
    keywords: ["TypeScript", "Astro"],
    url: "https://artka.dev/projects/x",
  };
  it("emits CreativeWork referencing Person as author/creator", () => {
    const node = buildCreativeWorkNode({ ...base, dateModified: new Date("2026-04-15T00:00:00Z") });
    expect(node["@type"]).toBe("CreativeWork");
    expect(node["@id"]).toBe("https://artka.dev/projects/x#creativework");
    expect(node.author).toEqual({ "@id": graphIds.person });
    expect(node.creator).toEqual({ "@id": graphIds.person });
    expect(node.datePublished).toBe("2026-04-01T00:00:00.000Z");
    expect(node.dateModified).toBe("2026-04-15T00:00:00.000Z");
    expect(node.keywords).toBe("TypeScript, Astro");
  });

  it("anchors the work to the page that presents it", () => {
    expect(buildCreativeWorkNode(base).mainEntityOfPage).toEqual({
      "@id": "https://artka.dev/projects/x#webpage",
    });
  });

  it("omits keywords when array empty", () => {
    expect("keywords" in buildCreativeWorkNode({ ...base, keywords: [] })).toBe(false);
  });
});

describe("portfolio graphs are traversable", () => {
  it("leaves no dangling @id on a project page", () => {
    const canonical = "https://artka.dev/projects/x";
    const creativeWork = buildCreativeWorkNode({
      locale: "ru",
      canonical,
      name: "X",
      description: "desc",
      role: "Solo",
      datePublished: new Date("2026-04-01T00:00:00Z"),
      keywords: [],
      url: canonical,
    }) as GraphNode;
    const breadcrumbs = buildBreadcrumbsNode({
      canonical,
      items: [
        { name: "Главная", href: "https://artka.dev/" },
        { name: "Проекты", href: "https://artka.dev/projects" },
        { name: "X" },
      ],
    }) as GraphNode;
    const webPage = buildWebPageNode({
      locale: "ru",
      canonical,
      name: "X",
      description: "desc",
      type: "ItemPage",
      breadcrumbId: `${canonical}#breadcrumbs`,
      mainEntityId: `${canonical}#creativework`,
    }) as GraphNode;

    const graph = buildGraph({ locale: "ru", extraNodes: [creativeWork, breadcrumbs, webPage] });

    expect(danglingIds(graph)).toEqual([]);
    // The page's subject is the work itself, not the page furniture.
    expect(webPage.mainEntity).toEqual({ "@id": `${canonical}#creativework` });
  });

  // The graph above is assembled by hand, so it proves the builders CAN be
  // wired, not that the pages wire them: `mainEntityId` is optional, and a
  // page that drops it still type-checks and still builds while the
  // CreativeWork goes back to hanging alone. The suffix is taken from the
  // builder, so a renamed `@id` scheme has to be followed by the pages.
});
