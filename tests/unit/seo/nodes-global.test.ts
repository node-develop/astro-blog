import { describe, expect, it } from "vitest";
import {
  buildPersonNode,
  buildOrganizationNode,
  buildWebSiteNode,
  buildBlogNode,
  graphIds,
  websiteId,
} from "~/lib/seo/nodes-global";
import { person } from "~/lib/seo/person";

describe("graphIds", () => {
  it("are stable canonical IDs", () => {
    expect(graphIds.person).toBe("https://artka.dev/#person");
    expect(graphIds.organization).toBe("https://artka.dev/#brand");
    expect(graphIds.website).toBe("https://artka.dev/#website");
    expect(graphIds.websiteRu).toBe("https://artka.dev/#website");
    expect(graphIds.websiteEn).toBe("https://artka.dev/#website-en");
    expect(graphIds.blogRu).toBe("https://artka.dev/#blog-ru");
    expect(graphIds.blogEn).toBe("https://artka.dev/#blog-en");
  });
});

describe("buildPersonNode", () => {
  it("emits a Person with @id and required fields", () => {
    const node = buildPersonNode();
    expect(node["@type"]).toBe("Person");
    expect(node["@id"]).toBe(graphIds.person);
    expect(node.name).toBe("Artyom Kashuta");
    expect(node.alternateName).toBe("Артём Кашута");
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
  it("emits inLanguage without advertising a nonexistent search endpoint", () => {
    const node = buildWebSiteNode("ru");
    expect(node["@type"]).toBe("WebSite");
    expect(node["@id"]).toBe(graphIds.website);
    expect(node.inLanguage).toBe("ru-RU");
    expect(node.alternateName).toContain("Artyom Kashuta technical blog");
    expect(node.description).toMatch(/Claude Code/i);
    expect(node.publisher).toEqual({ "@id": graphIds.organization });
    expect(node).not.toHaveProperty("potentialAction");
  });

  // One WebSite per locale: the shared #website @id used to carry conflicting
  // inLanguage/description depending on the page a crawler fetched first.
  it("emits a distinct EN WebSite linked to the RU original", () => {
    const ru = buildWebSiteNode("ru");
    const en = buildWebSiteNode("en");
    expect(en.inLanguage).toBe("en-US");
    expect(en["@id"]).toBe(graphIds.websiteEn);
    expect(en.url).toBe("https://artka.dev/en/");
    expect(en.translationOfWork).toEqual({ "@id": graphIds.websiteRu });
    expect(ru.workTranslation).toEqual({ "@id": graphIds.websiteEn });
    expect(ru["@id"]).not.toBe(en["@id"]);
    expect(websiteId("ru")).toBe(graphIds.websiteRu);
    expect(websiteId("en")).toBe(graphIds.websiteEn);
  });
});

describe("buildPersonNode — Plan 2 additions", () => {
  it("appends expertiseAreas to knowsAbout (deduped)", () => {
    const node = buildPersonNode();
    for (const area of person.expertiseAreas) {
      expect(node.knowsAbout).toContain(area);
    }
    expect(new Set(node.knowsAbout).size).toBe(node.knowsAbout.length);
  });

  it("emits subjectOf[] mirroring person.notableWork", () => {
    const node = buildPersonNode();
    expect(node.subjectOf).toHaveLength(person.notableWork.length);
    for (let i = 0; i < person.notableWork.length; i++) {
      const w = person.notableWork[i]!;
      const out = node.subjectOf[i]!;
      expect(out["@type"]).toBe("CreativeWork");
      expect(out.name).toBe(w.title);
      expect(out.url).toBe(new URL(w.url.endsWith("/") ? w.url : `${w.url}/`).toString());
      expect(out.description).toBe(w.description);
    }
  });
});

describe("buildBlogNode", () => {
  it("emits per-locale Blog node referencing person and organization", () => {
    const ru = buildBlogNode("ru");
    expect(ru["@type"]).toBe("Blog");
    expect(ru["@id"]).toBe(graphIds.blogRu);
    expect(ru.url).toBe("https://artka.dev/blog/");
    expect(ru.inLanguage).toBe("ru-RU");
    expect(ru.author).toEqual({ "@id": graphIds.person });
    expect(ru.publisher).toEqual({ "@id": graphIds.organization });

    const en = buildBlogNode("en");
    expect(en["@id"]).toBe(graphIds.blogEn);
    expect(en.url).toBe("https://artka.dev/en/blog/");
    expect(en.inLanguage).toBe("en-US");
  });
});
