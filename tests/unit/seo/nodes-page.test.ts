import { describe, expect, it } from "vitest";
import {
  buildBlogPostingNode,
  buildBreadcrumbListNode,
  buildWebPageNode,
  buildFaqPageNode,
} from "~/lib/seo/nodes-page";
import { graphIds } from "~/lib/seo/nodes-global";

describe("buildBlogPostingNode", () => {
  const baseInput = {
    locale: "ru" as const,
    canonical: "https://artka.dev/blog/foo",
    title: "Заголовок поста",
    description: "Описание",
    pubDate: new Date("2026-04-23T00:00:00.000Z"),
    updatedDate: new Date("2026-04-26T00:00:00.000Z"),
    image: "https://artka.dev/uploads/foo.png",
    keywords: ["claude-code", "guide"],
    articleBody: "Lorem ipsum dolor",
    wordCount: 1234,
  };

  it("references author and publisher by @id only", () => {
    const node = buildBlogPostingNode(baseInput);
    expect(node.author).toEqual({ "@id": graphIds.person });
    expect(node.publisher).toEqual({ "@id": graphIds.organization });
  });

  it("emits @id derived from canonical", () => {
    const node = buildBlogPostingNode(baseInput);
    expect(node["@id"]).toBe("https://artka.dev/blog/foo#blogposting");
  });

  it("includes articleBody and wordCount", () => {
    const node = buildBlogPostingNode(baseInput);
    expect(node.articleBody).toBe("Lorem ipsum dolor");
    expect(node.wordCount).toBe(1234);
  });

  it("omits keywords when empty", () => {
    const node = buildBlogPostingNode({ ...baseInput, keywords: [] });
    expect("keywords" in node).toBe(false);
  });

  it("omits dateModified when same as pubDate", () => {
    const same = baseInput.pubDate;
    const node = buildBlogPostingNode({ ...baseInput, updatedDate: same });
    expect(node.dateModified).toBe(same.toISOString());
  });
});

describe("buildBreadcrumbListNode", () => {
  it("renders 3-level RU breadcrumb", () => {
    const node = buildBreadcrumbListNode({
      locale: "ru",
      blogIndexLabel: "Блог",
      title: "Заголовок",
    });
    expect(node["@type"]).toBe("BreadcrumbList");
    expect(node.itemListElement).toHaveLength(3);
    expect(node.itemListElement[0].name).toBe("Главная");
    expect(node.itemListElement[1].item).toBe("https://artka.dev/blog/");
    expect(node.itemListElement[2].name).toBe("Заголовок");
  });

  it("uses /en/ paths for en locale", () => {
    const node = buildBreadcrumbListNode({
      locale: "en",
      blogIndexLabel: "Blog",
      title: "Title",
    });
    expect(node.itemListElement[0].item).toBe("https://artka.dev/en/");
    expect(node.itemListElement[1].item).toBe("https://artka.dev/en/blog/");
  });
});

describe("buildWebPageNode", () => {
  it("emits WebPage referencing the global Person via about", () => {
    const node = buildWebPageNode({
      locale: "ru",
      canonical: "https://artka.dev/about",
      name: "Обо мне",
      description: "О",
    });
    expect(node["@type"]).toBe("WebPage");
    expect(node["@id"]).toBe("https://artka.dev/about#webpage");
    expect(node.about).toEqual({ "@id": graphIds.person });
    expect(node.inLanguage).toBe("ru-RU");
  });
});

describe("buildFaqPageNode", () => {
  it("returns null when no faq items", () => {
    expect(buildFaqPageNode({ canonical: "https://artka.dev/blog/foo", items: [] })).toBeNull();
  });

  it("renders Question/Answer pairs when items present", () => {
    const node = buildFaqPageNode({
      canonical: "https://artka.dev/blog/foo",
      items: [{ question: "Q1?", answer: "A1." }],
    });
    expect(node).not.toBeNull();
    expect(node!["@type"]).toBe("FAQPage");
    expect(node!.mainEntity).toHaveLength(1);
    expect(node!.mainEntity[0]["@type"]).toBe("Question");
    expect(node!.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
    expect(node!.mainEntity[0].acceptedAnswer.text).toBe("A1.");
  });
});
