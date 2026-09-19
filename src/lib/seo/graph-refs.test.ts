import { describe, expect, it } from "vitest";
import { crossLocaleGlobalIds, findDanglingGraphRefs, graphNodesOf } from "./graph-refs";
import { buildGraph, type GraphNode } from "./schema";
import { buildBlogNode, graphIds, websiteId } from "./nodes-global";
import { buildBlogPostingNode, buildBreadcrumbsNode, buildWebPageNode } from "./nodes-page";
import { buildCollectionPageNode } from "./nodes-projects";

const POST = "https://artka.dev/blog/example/";

const dangling = (graph: ReadonlyArray<unknown>, locale: "ru" | "en" = "ru"): string[] =>
  findDanglingGraphRefs({ graph, locale }).map((ref) => `${ref.path} -> ${ref.id}`);

describe("findDanglingGraphRefs", () => {
  it("accepts a reference to a node defined in the same graph", () => {
    const graph = [
      { "@type": "Person", "@id": "https://artka.dev/#person", name: "Someone" },
      {
        "@type": "BlogPosting",
        "@id": `${POST}#blogposting`,
        author: { "@id": "https://artka.dev/#person" },
      },
    ];

    expect(dangling(graph)).toEqual([]);
  });

  it("reports a reference no node in the graph defines, with its path", () => {
    const graph = [
      {
        "@type": "BlogPosting",
        "@id": `${POST}#blogposting`,
        isPartOf: { "@id": graphIds.blogRu },
      },
    ];

    expect(dangling(graph)).toEqual([`BlogPosting.isPartOf -> ${graphIds.blogRu}`]);
  });

  it("resolves a reference against a definition nested inside another node", () => {
    const graph = [
      {
        "@type": "CollectionPage",
        "@id": "https://artka.dev/projects/#collection",
        // The hasPart entry is a minimal node DEFINITION, not a reference.
        hasPart: [
          {
            "@type": "CreativeWork",
            "@id": "https://artka.dev/projects/a/#creativework",
            url: "https://artka.dev/projects/a/",
            name: "A",
          },
        ],
      },
      {
        "@type": "ItemPage",
        "@id": "https://artka.dev/x/#webpage",
        mainEntity: { "@id": "https://artka.dev/projects/a/#creativework" },
      },
    ];

    expect(dangling(graph)).toEqual([]);
  });

  it("reports every entry of an array of bare references separately", () => {
    const graph = [
      {
        "@type": "Blog",
        "@id": "https://artka.dev/tags/rag/#blog",
        blogPost: [{ "@id": `${POST}a#blogposting` }, { "@id": `${POST}b#blogposting` }],
      },
    ];

    expect(dangling(graph)).toEqual([
      `Blog.blogPost[0] -> ${POST}a#blogposting`,
      `Blog.blogPost[1] -> ${POST}b#blogposting`,
    ]);
  });

  it("treats an object with @id and other keys as a definition, not a reference", () => {
    const graph = [
      {
        "@type": "WebPage",
        "@id": "https://artka.dev/x/#webpage",
        breadcrumb: { "@id": "https://artka.dev/x/#breadcrumbs" },
      },
      { "@type": "BreadcrumbList", "@id": "https://artka.dev/x/#breadcrumbs", itemListElement: [] },
    ];

    expect(dangling(graph)).toEqual([]);
  });

  it("names an untyped top-level node by its slot in the graph", () => {
    expect(dangling([{ mainEntity: { "@id": "https://artka.dev/#missing" } }])).toEqual([
      "@graph[0].mainEntity -> https://artka.dev/#missing",
    ]);
  });

  it("accepts a definition that appears after the reference to it", () => {
    const graph = [
      {
        "@type": "WebPage",
        "@id": "https://artka.dev/x/#webpage",
        about: { "@id": graphIds.person },
      },
      { "@type": "Person", "@id": graphIds.person, name: "Someone" },
    ];

    expect(dangling(graph)).toEqual([]);
  });

  describe("the cross-locale exception", () => {
    it("allows a Russian page to point at the English site-global nodes", () => {
      const graph = [
        {
          "@type": "WebSite",
          "@id": websiteId("ru"),
          workTranslation: { "@id": graphIds.websiteEn },
        },
        {
          "@type": "BlogPosting",
          "@id": `${POST}#blogposting`,
          isPartOf: { "@id": graphIds.blogEn },
        },
      ];

      expect(dangling(graph, "ru")).toEqual([]);
    });

    it("allows an English page to point at the Russian site-global nodes", () => {
      const graph = [
        {
          "@type": "WebSite",
          "@id": websiteId("en"),
          translationOfWork: { "@id": graphIds.websiteRu },
        },
      ];

      expect(dangling(graph, "en")).toEqual([]);
    });

    it("does NOT excuse a missing site-global node of the page's OWN locale", () => {
      const ownBlog = [
        {
          "@type": "BlogPosting",
          "@id": `${POST}#blogposting`,
          isPartOf: { "@id": graphIds.blogRu },
        },
      ];
      const ownSite = [
        {
          "@type": "WebPage",
          "@id": "https://artka.dev/x/#webpage",
          isPartOf: { "@id": websiteId("ru") },
        },
      ];

      expect(dangling(ownBlog, "ru")).toEqual([`BlogPosting.isPartOf -> ${graphIds.blogRu}`]);
      expect(dangling(ownSite, "ru")).toEqual([`WebPage.isPartOf -> ${websiteId("ru")}`]);
    });

    it("does NOT excuse Person or Organization: they have no locale and every page emits them", () => {
      const graph = [
        {
          "@type": "BlogPosting",
          "@id": `${POST}#blogposting`,
          author: { "@id": graphIds.person },
          publisher: { "@id": graphIds.organization },
        },
      ];

      expect(dangling(graph, "en")).toEqual([
        `BlogPosting.author -> ${graphIds.person}`,
        `BlogPosting.publisher -> ${graphIds.organization}`,
      ]);
    });

    it("exempts exactly the other locale's WebSite and Blog, nothing else", () => {
      expect([...crossLocaleGlobalIds("ru")].sort()).toEqual(
        [graphIds.websiteEn, graphIds.blogEn].sort(),
      );
      expect([...crossLocaleGlobalIds("en")].sort()).toEqual(
        [graphIds.websiteRu, graphIds.blogRu].sort(),
      );
    });
  });
});

/**
 * The two shipped defects, replayed through the real builders: a unit test on
 * hand-written fixtures alone would keep passing if a builder changed.
 */
describe("findDanglingGraphRefs on graphs the real builders produce", () => {
  const postingNodes = (): GraphNode[] => [
    buildWebPageNode({
      locale: "ru",
      canonical: POST,
      name: "Example",
      description: "Example",
      breadcrumbId: `${POST}#breadcrumbs`,
      mainEntityId: `${POST}#blogposting`,
    }) as GraphNode,
    buildBlogPostingNode({
      locale: "ru",
      canonical: POST,
      title: "Example",
      description: "Example",
      pubDate: new Date("2026-01-01T00:00:00Z"),
      image: "https://artka.dev/og/example-ru.png",
      keywords: [],
      articleBody: "body",
      wordCount: 1,
    }) as GraphNode,
    buildBreadcrumbsNode({
      canonical: POST,
      items: [{ name: "Главная", href: "https://artka.dev/" }],
    }) as GraphNode,
  ];

  it("catches the post whose isPartOf Blog node the page never emits", () => {
    const graph = buildGraph({ locale: "ru", extraNodes: postingNodes() })["@graph"];

    expect(dangling(graph)).toEqual([`BlogPosting.isPartOf -> ${graphIds.blogRu}`]);
  });

  it("passes once buildBlogNode is part of the same page", () => {
    const graph = buildGraph({
      locale: "ru",
      extraNodes: [...postingNodes(), buildBlogNode("ru") as GraphNode],
    })["@graph"];

    expect(dangling(graph)).toEqual([]);
  });

  it("passes on the portfolio page, whose hasPart embeds each project node", () => {
    const canonical = "https://artka.dev/projects/";
    const graph = buildGraph({
      locale: "ru",
      extraNodes: [
        buildCollectionPageNode({
          locale: "ru",
          canonical,
          name: "Проекты",
          description: "Проекты",
          breadcrumbId: `${canonical}#breadcrumbs`,
          items: [{ url: "https://artka.dev/projects/astro-blog/", name: "astro-blog" }],
        }) as GraphNode,
        buildBreadcrumbsNode({ canonical, items: [{ name: "Проекты" }] }) as GraphNode,
      ],
    })["@graph"];

    expect(dangling(graph)).toEqual([]);
  });

  it("would catch the portfolio again if hasPart went back to bare references", () => {
    const canonical = "https://artka.dev/projects/";
    const collection = buildCollectionPageNode({
      locale: "ru",
      canonical,
      name: "Проекты",
      description: "Проекты",
      breadcrumbId: `${canonical}#breadcrumbs`,
      items: [{ url: "https://artka.dev/projects/astro-blog/", name: "astro-blog" }],
    });
    const regressed = {
      ...collection,
      hasPart: collection.hasPart.map((part) => ({ "@id": part["@id"] })),
    } as GraphNode;

    expect(
      dangling(
        buildGraph({
          locale: "ru",
          extraNodes: [
            regressed,
            buildBreadcrumbsNode({ canonical, items: [{ name: "Проекты" }] }) as GraphNode,
          ],
        })["@graph"],
      ),
    ).toEqual(["CollectionPage.hasPart[0] -> https://artka.dev/projects/astro-blog/#creativework"]);
  });
});

describe("graphNodesOf", () => {
  it("unwraps the @graph a page emits", () => {
    expect(
      graphNodesOf({ "@context": "https://schema.org", "@graph": [{ "@type": "Person" }] }),
    ).toEqual([{ "@type": "Person" }]);
  });

  it("accepts a bare array of nodes", () => {
    expect(graphNodesOf([{ "@type": "Person" }])).toEqual([{ "@type": "Person" }]);
  });

  it("accepts a single node without a @graph wrapper", () => {
    expect(graphNodesOf({ "@type": "WebSite", "@id": websiteId("ru") })).toEqual([
      { "@type": "WebSite", "@id": websiteId("ru") },
    ]);
  });

  it("yields nothing for a block that is not an object or array", () => {
    expect(graphNodesOf("https://schema.org")).toEqual([]);
    expect(graphNodesOf(null)).toEqual([]);
  });
});
