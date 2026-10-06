import { describe, expect, it } from "vitest";
import { validatePageGraph } from "./graph-schema";
import { buildGraph, type GraphNode } from "./schema";
import { buildBlogPostingNode, buildBreadcrumbsNode, buildWebPageNode } from "./nodes-page";

const CANONICAL = "https://artka.dev/blog/example/";

const postGraph = (locale: "ru" | "en"): ReadonlyArray<GraphNode> =>
  buildGraph({
    locale,
    extraNodes: [
      buildBlogPostingNode({
        locale,
        canonical: CANONICAL,
        title: "Example",
        description: "An example post",
        pubDate: new Date("2026-01-02T00:00:00Z"),
        updatedDate: new Date("2026-02-03T00:00:00Z"),
        image: "https://artka.dev/og/blog/example.png",
        keywords: ["a"],
        articleBody: "Body text",
        wordCount: 2,
      }) as GraphNode,
      buildWebPageNode({
        locale,
        canonical: CANONICAL,
        name: "Example",
        description: "An example post",
      }) as GraphNode,
      buildBreadcrumbsNode({
        canonical: CANONICAL,
        items: [
          { name: "Home", href: "https://artka.dev/" },
          { name: "Blog", href: "https://artka.dev/blog/" },
          { name: "Example" },
        ],
      }) as GraphNode,
    ],
  })["@graph"];

// The generator is held to the contract: what the builders emit must satisfy the schemas the
// build check applies to dist. A builder change that breaks the contract fails here, without a build.
describe("validatePageGraph on the output of the builders", () => {
  it.each(["ru", "en"] as const)("accepts a %s post graph", (locale) => {
    expect(
      validatePageGraph({ graph: postGraph(locale), locale, canonical: CANONICAL, isPost: true }),
    ).toEqual([]);
  });

  it("accepts a non-post page without BlogPosting", () => {
    const graph = buildGraph({ locale: "ru", extraNodes: [] })["@graph"];
    expect(
      validatePageGraph({ graph, locale: "ru", canonical: "https://artka.dev/", isPost: false }),
    ).toEqual([]);
  });
});
