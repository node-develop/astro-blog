import { describe, expect, it } from "vitest";
import { buildCollectionPageNode, buildCreativeWorkNode } from "~/lib/seo/nodes-projects";
import { graphIds } from "~/lib/seo/nodes-global";

describe("buildCollectionPageNode", () => {
  it("emits CollectionPage referencing Person via author", () => {
    const node = buildCollectionPageNode({
      locale: "ru",
      canonical: "https://artka.dev/projects",
      name: "Проекты",
      description: "Портфолио",
      itemUrls: ["https://artka.dev/projects/foo", "https://artka.dev/projects/bar"],
    });
    expect(node["@type"]).toBe("CollectionPage");
    expect(node["@id"]).toBe("https://artka.dev/projects#collection");
    expect(node.author).toEqual({ "@id": graphIds.person });
    expect(node.inLanguage).toBe("ru-RU");
    expect(node.hasPart).toEqual([
      { "@id": "https://artka.dev/projects/foo#creativework" },
      { "@id": "https://artka.dev/projects/bar#creativework" },
    ]);
  });
  it("uses en-US for en locale", () => {
    expect(
      buildCollectionPageNode({
        locale: "en",
        canonical: "https://artka.dev/en/projects",
        name: "P",
        description: "D",
        itemUrls: [],
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
  it("omits keywords when array empty", () => {
    expect("keywords" in buildCreativeWorkNode({ ...base, keywords: [] })).toBe(false);
  });
});
