import { describe, expect, it } from "vitest";
import {
  buildPersonNode,
  buildOrganizationNode,
  buildWebSiteNode,
  buildBlogNode,
  graphIds,
} from "~/lib/seo/nodes-global";

describe("graphIds", () => {
  it("are stable canonical IDs", () => {
    expect(graphIds.person).toBe("https://artka.dev/#person");
    expect(graphIds.organization).toBe("https://artka.dev/#brand");
    expect(graphIds.website).toBe("https://artka.dev/#website");
    expect(graphIds.blogRu).toBe("https://artka.dev/#blog-ru");
    expect(graphIds.blogEn).toBe("https://artka.dev/#blog-en");
  });
});

describe("buildPersonNode", () => {
  it("emits a Person with @id and required fields", () => {
    const node = buildPersonNode();
    expect(node["@type"]).toBe("Person");
    expect(node["@id"]).toBe(graphIds.person);
    expect(node.name).toBe("Артём Кашута");
    expect(node.knowsAbout).toContain("Claude Code");
    expect(node.email).toMatch(/@/);
  });
});

describe("buildOrganizationNode", () => {
  it("links founder to Person by @id", () => {
    const node = buildOrganizationNode();
    expect(node["@type"]).toBe("Organization");
    expect(node["@id"]).toBe(graphIds.organization);
    expect(node.founder).toEqual({ "@id": graphIds.person });
    expect(node.logo["@type"]).toBe("ImageObject");
  });
});

describe("buildWebSiteNode", () => {
  it("emits inLanguage and SearchAction for ru", () => {
    const node = buildWebSiteNode("ru");
    expect(node["@type"]).toBe("WebSite");
    expect(node["@id"]).toBe(graphIds.website);
    expect(node.inLanguage).toBe("ru-RU");
    expect(node.publisher).toEqual({ "@id": graphIds.organization });
    expect(node.potentialAction["@type"]).toBe("SearchAction");
    expect(node.potentialAction.target).toContain("search?q={search_term_string}");
  });

  it("switches inLanguage for en", () => {
    expect(buildWebSiteNode("en").inLanguage).toBe("en-US");
  });
});

describe("buildBlogNode", () => {
  it("emits per-locale Blog node referencing person and organization", () => {
    const ru = buildBlogNode("ru");
    expect(ru["@type"]).toBe("Blog");
    expect(ru["@id"]).toBe(graphIds.blogRu);
    expect(ru.url).toBe("https://artka.dev/blog");
    expect(ru.inLanguage).toBe("ru-RU");
    expect(ru.author).toEqual({ "@id": graphIds.person });
    expect(ru.publisher).toEqual({ "@id": graphIds.organization });

    const en = buildBlogNode("en");
    expect(en["@id"]).toBe(graphIds.blogEn);
    expect(en.url).toBe("https://artka.dev/en/blog");
    expect(en.inLanguage).toBe("en-US");
  });
});
