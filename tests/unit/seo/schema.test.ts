import { describe, expect, it } from "vitest";
import { buildGraph } from "~/lib/seo/schema";
import { graphIds } from "~/lib/seo/nodes-global";

describe("buildGraph", () => {
  it("always emits Person, Organization, WebSite", () => {
    const graph = buildGraph({ locale: "ru", extraNodes: [] });
    expect(graph["@context"]).toBe("https://schema.org");
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).toEqual(expect.arrayContaining(["Person", "Organization", "WebSite"]));
  });

  it("appends extraNodes to the graph in order", () => {
    const blogPostingNode = { "@type": "BlogPosting", "@id": "x" };
    const breadcrumbNode = { "@type": "BreadcrumbList" };
    const graph = buildGraph({
      locale: "ru",
      extraNodes: [blogPostingNode, breadcrumbNode],
    });
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types[types.length - 2]).toBe("BlogPosting");
    expect(types[types.length - 1]).toBe("BreadcrumbList");
  });

  it("filters out null extraNodes", () => {
    const graph = buildGraph({
      locale: "ru",
      extraNodes: [null, { "@type": "WebPage" }, null],
    });
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).toContain("WebPage");
    expect(types.filter((t) => t === undefined)).toHaveLength(0);
  });

  it("uses unique @ids across the graph", () => {
    const graph = buildGraph({ locale: "ru", extraNodes: [] });
    const ids = graph["@graph"].map((n) => n["@id"]).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(graphIds.person);
    expect(ids).toContain(graphIds.organization);
    expect(ids).toContain(graphIds.website);
  });
});
