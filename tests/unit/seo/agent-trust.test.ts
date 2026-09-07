import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { GET as getLlmsTxt } from "../../../src/pages/llms.txt";
import { buildOrganizationNode } from "~/lib/seo/nodes-global";
import { buildLocaleSitemapEntries, type SitemapInput } from "~/lib/seo/sitemap";

const repoFile = (...segments: readonly string[]): string => join(process.cwd(), ...segments);

const emptySitemapInput = (locale: "ru" | "en"): SitemapInput => ({
  locale,
  posts: [],
  courseEntries: [],
  lessonEntries: [],
  projectEntries: [],
  tagGroups: new Map(),
});

const markdownBody = (source: string): string =>
  source
    .replace(/^---[\s\S]*?---\s*/, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#*_`>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("agent trust signals", () => {
  it("publishes a verifiable editorial contact point and brand context in Organization JSON-LD", () => {
    const organization = buildOrganizationNode();

    expect(organization.alternateName).toEqual(
      expect.arrayContaining(["artka.dev by Artyom Kashuta", "artka.dev by Артём Кашута"]),
    );
    expect(organization.description).toMatch(/Claude Code/i);
    expect(organization.contactPoint).toMatchObject({
      "@type": "ContactPoint",
      contactType: "editorial and technical inquiries",
      email: "a@artka.dev",
      url: "https://artka.dev/contact/",
      availableLanguage: ["Russian", "English"],
    });
  });

  it("includes localized contact and privacy pages in both sitemaps", () => {
    const ruUrls = buildLocaleSitemapEntries(emptySitemapInput("ru")).map((entry) => entry.loc);
    const enUrls = buildLocaleSitemapEntries(emptySitemapInput("en")).map((entry) => entry.loc);

    expect(ruUrls).toEqual(
      expect.arrayContaining(["https://artka.dev/contact/", "https://artka.dev/privacy/"]),
    );
    expect(enUrls).toEqual(
      expect.arrayContaining(["https://artka.dev/en/contact/", "https://artka.dev/en/privacy/"]),
    );
  });

  it("gives agents specific when-to-use and retrieval guidance", async () => {
    // llms.txt is generated (src/pages/llms.txt.ts), no longer a public/ file.
    const llms = await (await getLlmsTxt({} as APIContext)).text();

    expect(llms).toContain("**When to use artka.dev**");
    expect(llms).toContain("**How agents should use this site**");
    expect(llms).toContain("Claude Code internals");
    expect(llms).toContain("https://artka.dev/contact/");
    expect(llms).toContain("https://artka.dev/privacy/");
  });

  it("ships substantial bilingual trust content through real routes and the footer", () => {
    const pages = [
      ["src/content/site/contact.md", "src/pages/contact.astro"],
      ["src/content/site/privacy.md", "src/pages/privacy.astro"],
      ["src/content/site/en/contact.md", "src/pages/en/contact.astro"],
      ["src/content/site/en/privacy.md", "src/pages/en/privacy.astro"],
    ] as const;

    for (const [contentPath, routePath] of pages) {
      expect(existsSync(repoFile(routePath)), routePath).toBe(true);
      const content = readFileSync(repoFile(contentPath), "utf8");
      expect(markdownBody(content).length, contentPath).toBeGreaterThanOrEqual(500);
    }

    const layout = readFileSync(repoFile("src/layouts/BaseLayout.astro"), "utf8");
    const ruStrings = JSON.parse(
      readFileSync(repoFile("src/i18n/strings.ru.json"), "utf8"),
    ) as Record<string, string>;
    const enStrings = JSON.parse(
      readFileSync(repoFile("src/i18n/strings.en.json"), "utf8"),
    ) as Record<string, string>;

    expect(layout).toContain("`${localePrefix}/contact`");
    expect(layout).toContain("`${localePrefix}/privacy`");
    expect(ruStrings["nav.contact"]).toBe("Контакты");
    expect(ruStrings["nav.privacy"]).toBe("Конфиденциальность");
    expect(enStrings["nav.contact"]).toBe("Contact");
    expect(enStrings["nav.privacy"]).toBe("Privacy");
  });
});
